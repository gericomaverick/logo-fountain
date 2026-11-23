<?php

use App\Models\Profile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Tests\Support\FakeStripe;
use Tests\Support\SessionRows;
use Tests\Support\TruncatesDatabaseAsOwner;

// Story 5.6 (K-12; DV-6, DV-23): `POST /api/admin/checkout/reprocess`. Stripe is the in-process fake; no live key.
uses(TruncatesDatabaseAsOwner::class);

const RP_ORIGIN = 'https://app.example.com';
const RP_SID = 'rpdefghijabcdefghijabcdefghijabcdefghij1';

beforeEach(function () {
    Queue::fake();
    config(['session.driver' => 'database', 'portal.public_site_url' => RP_ORIGIN, 'mail.default' => 'array', 'mail.from.address' => 'from@example.test',
        'portal.admin_notification_emails' => 'ops@example.test', 'services.postmark.token' => 'pm_test']);
});
afterEach(fn () => FakeStripe::uninstall());

function rpAdmin(): void
{
    SessionRows::insert(RP_SID, Profile::factory()->admin()->create()->user->id, time(), time(), true);
    test()->withCredentials()->withCookie(config('session.cookie'), RP_SID);
}

function rpPost(mixed $body)
{
    $t = test()->withHeaders(['Origin' => RP_ORIGIN]);

    return is_array($body) ? $t->postJson('/api/admin/checkout/reprocess', $body)
        : $t->call('POST', '/api/admin/checkout/reprocess', [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_ORIGIN' => RP_ORIGIN], $body);
}

function rpSession(string $status = 'paid'): array
{
    return ['id' => 'cs_test_REPROC01', 'object' => 'checkout.session', 'payment_status' => $status, 'currency' => 'gbp', 'amount_total' => 34900,
        'payment_intent' => 'pi_rp', 'customer_details' => ['email' => 'rp@example.test', 'name' => 'Grace Hopper'], 'metadata' => [], 'custom_fields' => [['key' => 'first_name', 'type' => 'text', 'text' => ['value' => 'Grace']], ['key' => 'last_name', 'type' => 'text', 'text' => ['value' => 'Hopper']]]];
}

function rpLineItems(): array
{
    return ['object' => 'list', 'has_more' => false, 'url' => '/x', 'data' => [['id' => 'li_1', 'object' => 'item', 'price' => ['id' => config('catalog.packages.essential.price_id')]]]];
}

it('guards: 401 anonymous, 403 non-admin, 400 on a blank session id', function () {
    FakeStripe::install();
    rpPost(['session_id' => 'cs_x'])->assertStatus(401);
    $user = Profile::factory()->create()->user;
    SessionRows::insert(RP_SID, $user->id, time(), time(), true);
    test()->withCredentials()->withCookie(config('session.cookie'), RP_SID);
    rpPost(['session_id' => 'cs_x'])->assertStatus(403);
    DB::table('sessions')->where('id', RP_SID)->delete();
    rpAdmin();
    rpPost(['session_id' => '  '])->assertStatus(400)->assertJsonPath('error.code', 'MISSING_SESSION_ID'); // DV-23
    rpPost('{nope')->assertStatus(400);
})->group('admin', 'api', 'deviation');

it('fulfils, then sends the customer and admin emails once, and says deduped the second time (DV-6)', function () {
    rpAdmin();
    $s = FakeStripe::install();
    $s->respondWith(200, rpSession())->respondWith(200, rpLineItems());
    $first = rpPost(['session_id' => ' cs_test_REPROC01 '])->assertOk()
        ->assertJsonPath('deduped', false)->assertJsonPath('message', 'Session fulfilled successfully.')->assertJsonPath('orderStatus', 'FULFILLED');
    $s->respondWith(200, rpSession());
    rpPost(['session_id' => 'cs_test_REPROC01'])->assertOk()->assertJsonPath('deduped', true)
        ->assertJsonPath('message', 'Session already fulfilled; ensured access provisioning.')->assertJsonPath('orderId', $first->json('orderId'));

    expect($first->json('provisionedUserId'))->not->toBeNull()
        ->and(DB::table('profiles')->where('id', $first->json('provisionedUserId'))->value('full_name'))->toBeString()->toContain('Grace') // AC 4: names reach provisioning
        ->and(DB::table('audit_events')->where('type', 'email_sent:checkout_auth:cs_test_REPROC01')->count())->toBe(1)
        ->and(DB::table('audit_events')->where('type', 'email_sent:admin_new_project')->count())->toBe(1)
        ->and(DB::table('stripe_events')->count())->toBe(0); // no ledger write
})->group('admin', 'api', 'deviation');

it('refuses an unpaid session with 409 and creates nothing', function () {
    rpAdmin();
    FakeStripe::install()->respondWith(200, rpSession('unpaid'));
    rpPost(['session_id' => 'cs_test_REPROC01'])->assertStatus(409)->assertJsonPath('error.code', 'CHECKOUT_SESSION_NOT_PAID')
        ->assertJsonPath('error.message', 'Checkout session has not been paid; nothing was provisioned.');
    expect(DB::table('project_orders')->count())->toBe(0)->and(DB::table('users')->count())->toBe(1);
    Queue::assertNothingPushed();
})->group('admin', 'api');

it('answers 404 for an unknown session and 502 for any other Stripe failure (DV-23)', function () {
    rpAdmin();
    $s = FakeStripe::install();
    $s->respondWith(404, ['error' => ['type' => 'invalid_request_error', 'message' => 'No such checkout.session', 'code' => 'resource_missing']]);
    rpPost(['session_id' => 'cs_nope'])->assertStatus(404)->assertJsonPath('error.code', 'CHECKOUT_SESSION_NOT_FOUND');
    $s->respondWith(500, ['error' => ['type' => 'api_error', 'message' => 'secret stripe detail']]);
    $r = rpPost(['session_id' => 'cs_down'])->assertStatus(502)->assertJsonPath('error.code', 'STRIPE_UNAVAILABLE');
    expect($r->getContent())->not->toContain('secret stripe detail');
})->group('admin', 'api', 'deviation');

it('sends no mail from the controller itself (ADR-015)', function () {
    $src = (string) file_get_contents(app_path('Http/Controllers/Api/ReprocessCheckoutController.php'));
    expect($src)->not->toContain('Mail::')->and($src)->not->toContain('LifecycleMail')->and($src)->not->toContain('SendAuthLink');
});

it('writes its own audit row, with the admin, the sessions and the outcome, even when nothing was left to do (DV-26)', function () {
    rpAdmin();
    $adminId = DB::table('sessions')->where('id', RP_SID)->value('user_id');
    $s = FakeStripe::install();
    $s->respondWith(200, rpSession())->respondWith(200, rpLineItems());
    rpPost(['session_id' => 'cs_test_REPROC01'])->assertOk();
    $s->respondWith(200, rpSession());
    rpPost(['session_id' => 'cs_test_REPROC01'])->assertOk()->assertJsonPath('deduped', true);

    $rows = DB::table('audit_events')->where('type', 'checkout_reprocessed')->orderBy('created_at')->get();
    expect($rows)->toHaveCount(2)->and($rows->pluck('actor_id')->unique()->all())->toBe([$adminId]);
    $payloads = $rows->map(fn ($r) => json_decode((string) $r->payload, true))->all();
    expect(array_column($payloads, 'outcome'))->toBe(['fulfilled', 'already_fulfilled'])
        ->and($payloads[1]['checkoutSessionId'])->toBe('cs_test_REPROC01')
        ->and($payloads[1])->toHaveKey('adminSessionId');
})->group('admin', 'api', 'deviation');

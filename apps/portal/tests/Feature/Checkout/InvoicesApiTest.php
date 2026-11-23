<?php

use App\Models\ClientMembership;
use App\Models\Profile;
use App\Models\Project;
use App\Models\ProjectOrder;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Tests\Support\FakeStripe;
use Tests\Support\SessionRows;
use Tests\Support\TruncatesDatabaseAsOwner;

uses(TruncatesDatabaseAsOwner::class);

// Story 5.7 (K-11, API half; AC 1, 2): the three invoice lists. Stripe is the in-process fake; no live key.
const IA_SID = 'iadefghijabcdefghijabcdefghijabcdefghij1';

beforeEach(fn () => config(['session.driver' => 'database']));
afterEach(fn () => FakeStripe::uninstall());

function iaSignIn(User $user): void
{
    SessionRows::insert(IA_SID, $user->id, time(), time(), true);
    test()->withCredentials()->withCookie(config('session.cookie'), IA_SID);
}

function iaOrder(Project $project, string $status, string $session, string $at): ProjectOrder
{
    $o = ProjectOrder::query()->create(['project_id' => $project->id, 'client_id' => $project->client_id, 'status' => $status, 'currency' => 'gbp',
        'total_cents' => 34900, 'stripe_checkout_session_id' => $session]);
    DB::table('project_orders')->where('id', $o->id)->update(['created_at' => $at]);

    return $o;
}

function iaBrief(Project $project, int $version, string $brand): void
{
    DB::table('project_briefs')->insert(['id' => fake()->uuid(), 'project_id' => $project->id, 'version' => $version, 'answers' => json_encode(['brandName' => $brand]), 'created_by' => Profile::factory()->create()->id, 'created_at' => now()]);
}

function iaSession(string $receipt): array
{
    return ['id' => 'cs', 'object' => 'checkout.session', 'invoice' => null, 'payment_intent' => ['id' => 'pi', 'object' => 'payment_intent', 'latest_charge' => ['id' => 'ch', 'object' => 'charge', 'receipt_url' => $receipt]]];
}

function iaGet(string $path): TestResponse
{
    return test()->getJson($path);
}

it('lists a member project newest first with the item shape and a document label', function () {
    $project = Project::factory()->create();
    iaBrief($project, 1, 'Old');
    iaBrief($project, 2, ' Acme ');
    iaOrder($project, 'PENDING', 'cs_old', '2026-01-01 10:00:00.000');
    $new = iaOrder($project, 'FULFILLED', 'cs_new', '2026-02-03 04:05:06.789');
    iaSignIn(ClientMembership::factory()->create(['client_id' => $project->client_id])->profile->user);
    FakeStripe::install()->respondWith(200, iaSession('https://pay.stripe.test/r/new'))->respondWith(200, iaSession('https://pay.stripe.test/r/old'));

    $res = iaGet("/api/projects/{$project->id}/invoices")->assertOk();

    expect($res->json('invoices.0'))->toBe([
        'id' => $new->id, 'projectId' => $project->id, 'projectName' => 'Acme', 'amountCents' => 34900, 'currency' => 'gbp', 'status' => 'Paid',
        'date' => '2026-02-03T04:05:06.789Z', 'invoiceId' => null, 'invoicePdfUrl' => null, 'hostedInvoiceUrl' => null,
        'receiptUrl' => 'https://pay.stripe.test/r/new', 'documentType' => 'receipt', 'documentLabel' => 'Payment receipt (paid-safe)',
        'downloadUrl' => 'https://pay.stripe.test/r/new',
    ]);
    expect($res->json('invoices.1.status'))->toBe('PENDING')->and($res->json('invoices'))->toHaveCount(2);
})->group('invoices', 'api');

it('lists every order of every client the user belongs to, with no label and a client-safe name', function () {
    $a = Project::factory()->create();
    $b = Project::factory()->create();
    $stranger = Project::factory()->create();
    $user = ClientMembership::factory()->create(['client_id' => $a->client_id])->profile->user;
    ClientMembership::factory()->create(['client_id' => $b->client_id, 'user_id' => $user->id]);
    iaOrder($a, 'FULFILLED', 'cs_a', '2026-01-01 00:00:00.000');
    iaOrder($b, 'FULFILLED', 'cs_b', '2026-01-02 00:00:00.000');
    iaOrder($stranger, 'FULFILLED', 'cs_c', '2026-01-03 00:00:00.000');
    iaSignIn($user);
    FakeStripe::install()->respondWith(200, iaSession('https://pay.stripe.test/r/b'))->respondWith(200, iaSession('https://pay.stripe.test/r/a'));

    $res = iaGet('/api/invoices')->assertOk();

    expect($res->json('invoices'))->toHaveCount(2)->and($res->json('invoices.0.projectId'))->toBe($b->id)
        ->and($res->json('invoices.0.projectName'))->toBe('Your logo project')->and($res->json('invoices.0'))->not->toHaveKey('documentLabel');
})->group('invoices', 'api');

it('names the project for the admin and lists any project without membership', function () {
    $project = Project::factory()->create();
    iaBrief($project, 1, 'Acme');
    iaOrder($project, 'FULFILLED', 'cs_a', '2026-01-01 00:00:00.000');
    iaSignIn(Profile::factory()->admin()->create()->user);
    FakeStripe::install()->respondWith(200, iaSession('https://pay.stripe.test/r/a'));

    $res = iaGet("/api/admin/projects/{$project->id}/invoices")->assertOk();

    expect($res->json('invoices.0.projectName'))->toBe('Acme · #'.substr($project->id, 0, 8))->and($res->json('invoices.0'))->not->toHaveKey('documentLabel');
    iaGet('/api/admin/projects/'.fake()->uuid().'/invoices')->assertOk()->assertExactJson(['invoices' => []]);
})->group('invoices', 'api');

it('guards each route: 401 anonymous, 404 for a non-member (an admin too), 403 for a non-admin', function () {
    $project = Project::factory()->create();
    foreach (['/api/invoices', "/api/projects/{$project->id}/invoices", "/api/admin/projects/{$project->id}/invoices"] as $path) {
        iaGet($path)->assertStatus(401);
    }
    iaSignIn(Profile::factory()->create()->user);
    iaGet("/api/projects/{$project->id}/invoices")->assertStatus(404)->assertJsonPath('error.code', 'PROJECT_NOT_FOUND');
    iaGet('/api/projects/not-a-uuid/invoices')->assertStatus(404);
    iaGet("/api/admin/projects/{$project->id}/invoices")->assertStatus(403);
    DB::table('sessions')->where('id', IA_SID)->delete();
    iaSignIn(Profile::factory()->admin()->create()->user);
    iaGet("/api/projects/{$project->id}/invoices")->assertStatus(404);
})->group('invoices', 'api');

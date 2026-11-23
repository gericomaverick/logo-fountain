<?php

use App\Actions\Checkout\FulfilCheckout;
use App\Actions\Checkout\ProcessStripeEvent;
use App\Actions\Checkout\RecordHopelessCheckout;
use App\Jobs\SendLifecycleMail;
use App\Support\Stripe\FulfilmentError;
use App\Support\Stripe\HopelessCheckoutFailure;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Stripe\Event;
use Tests\Support\FakeStripe;
use Tests\Support\TruncatesDatabaseAsOwner;

// Story 5.5 (K-09; DV-2, DV-15 mismatch, DV-24): additive fulfilment of a paid upsell session. Stripe is the fake.
uses(TruncatesDatabaseAsOwner::class);

beforeEach(function () {
    Queue::fake();
    config(['mail.default' => 'array', 'mail.from.address' => 'from@example.test', 'portal.public_site_url' => 'https://portal.example.test',
        'portal.admin_notification_emails' => 'ops@example.test']);
});
afterEach(fn () => FakeStripe::uninstall());

/** A project bought as $package; returns its id. */
function upsellProject(string $package = 'essential'): string
{
    $s = FakeStripe::install();
    $s->respondWith(200, ['object' => 'list', 'has_more' => false, 'url' => '/x', 'data' => [['id' => 'li_1', 'object' => 'item', 'price' => ['id' => config("catalog.packages.{$package}.price_id")]]]]);
    $base = ['id' => 'cs_test_BASE'.$package, 'payment_status' => 'paid', 'currency' => 'gbp', 'amount_total' => 34900, 'payment_intent' => 'pi_base',
        'customer_details' => ['email' => 'buyer@example.test', 'name' => 'Ada Lovelace'], 'metadata' => []];

    return app(FulfilCheckout::class)->fulfil($base)->projectId;
}

function upsellSession(string $id, array $metadata, array $over = []): array
{
    return $over + ['id' => $id, 'payment_status' => 'paid', 'currency' => 'gbp', 'amount_total' => 9500, 'payment_intent' => 'pi_'.$id,
        'customer_details' => ['email' => 'buyer@example.test', 'name' => 'Ada Lovelace'], 'metadata' => $metadata];
}

function limits(string $projectId): array
{
    return DB::table('project_entitlements')->where('project_id', $projectId)->pluck('limit_int', 'key')->all();
}

it('adds one revision for an add-on, once, with the order and audit', function () {
    $p = upsellProject();
    $session = upsellSession('cs_test_ADDON001', ['kind' => 'addon', 'projectId' => $p, 'addonKey' => 'extra_revision', 'fromPackage' => 'essential']);
    $r = app(FulfilCheckout::class)->fulfil($session);

    expect($r->deduped)->toBeFalse()->and($r->projectId)->toBe($p)->and(limits($p))->toBe(['concepts' => 1, 'revisions' => 2])
        ->and(DB::table('project_orders')->where('campaign_slug', 'addon:extra_revision')->value('status'))->toBe('FULFILLED')
        ->and(DB::table('audit_events')->where('type', 'entitlement_addon_applied')->count())->toBe(1);

    $again = app(FulfilCheckout::class)->fulfil($session);
    expect($again->deduped)->toBeTrue()->and(limits($p)['revisions'])->toBe(2);
});

it('creates the revisions entitlement at 1 when it is missing', function () {
    $p = upsellProject();
    DB::table('project_entitlements')->where('project_id', $p)->where('key', 'revisions')->delete();
    app(FulfilCheckout::class)->fulfil(upsellSession('cs_test_ADDON002', ['kind' => 'addon', 'projectId' => $p, 'addonKey' => 'extra_revision']));
    expect(limits($p)['revisions'])->toBe(1);
})->group('deviation');

it('upgrades additively: essential 1/1 plus an add-on, then to professional, is 2/3 (DV-2)', function () {
    $p = upsellProject();
    app(FulfilCheckout::class)->fulfil(upsellSession('cs_test_ADDON003', ['kind' => 'addon', 'projectId' => $p, 'addonKey' => 'extra_revision']));
    app(FulfilCheckout::class)->fulfil(upsellSession('cs_test_UPGR0001', ['kind' => 'upgrade', 'projectId' => $p, 'fromPackage' => 'essential', 'toPackage' => 'professional'], ['amount_total' => 49500]));

    expect(limits($p))->toBe(['concepts' => 2, 'revisions' => 3])
        ->and(DB::table('projects')->where('id', $p)->value('package_code'))->toBe('professional')
        ->and(DB::table('projects')->where('id', $p)->value('version'))->toBe(0)
        ->and(DB::table('audit_events')->where('type', 'package_upgrade_applied')->count())->toBe(1);
})->group('deviation', 'upsell');

it('applies nothing and raises a permanent failure when the project has moved off fromPackage (DV-24)', function () {
    $p = upsellProject();
    $up = ['kind' => 'upgrade', 'projectId' => $p, 'fromPackage' => 'essential', 'toPackage' => 'professional'];
    app(FulfilCheckout::class)->fulfil(upsellSession('cs_test_UPGR0002', $up));
    $before = limits($p);

    try {
        app(FulfilCheckout::class)->fulfil(upsellSession('cs_test_UPGR0003', $up)); // a second paid session for the same step
        $this->fail('expected a permanent failure');
    } catch (HopelessCheckoutFailure $e) {
        expect($e->reason)->toBe(HopelessCheckoutFailure::UPGRADE_STALE_FROM_PACKAGE)->and($e->projectId)->toBe($p);
    }
    expect(limits($p))->toBe($before)->and(DB::table('project_orders')->where('stripe_checkout_session_id', 'cs_test_UPGR0003')->exists())->toBeFalse();
})->group('deviation');

it('never applies a downgrade or a same-tier step', function () {
    $p = upsellProject('complete');
    $before = limits($p);
    expect(fn () => app(FulfilCheckout::class)->fulfil(upsellSession('cs_test_DOWN0001', ['kind' => 'upgrade', 'projectId' => $p, 'fromPackage' => 'complete', 'toPackage' => 'essential'])))
        ->toThrow(HopelessCheckoutFailure::class);
    expect(limits($p))->toBe($before);
})->group('deviation');

it('treats an unknown project as a permanent failure', function () {
    FakeStripe::install();
    expect(fn () => app(FulfilCheckout::class)->fulfil(upsellSession('cs_test_NOPROJ01', ['kind' => 'addon', 'projectId' => '00000000-0000-4000-8000-000000000000', 'addonKey' => 'extra_revision'])))
        ->toThrow(HopelessCheckoutFailure::class);
});

it('treats metadata that does not parse as a package session that fails the allowlist', function () {
    $s = FakeStripe::install();
    $s->respondWith(200, ['object' => 'list', 'has_more' => false, 'url' => '/x', 'data' => []]);
    expect(fn () => app(FulfilCheckout::class)->fulfil(upsellSession('cs_test_BADMETA1', ['kind' => 'addon', 'projectId' => 'x', 'addonKey' => 'nope'])))
        ->toThrow(FulfilmentError::class);
});

it('provisions no account and alerts the admin once when the buyer email differs (DV-15)', function () {
    $p = upsellProject();
    $users = DB::table('users')->count();
    $session = upsellSession('cs_test_MISMAT01', ['kind' => 'addon', 'projectId' => $p, 'addonKey' => 'extra_revision'],
        ['customer_details' => ['email' => 'someone-else@example.test', 'name' => 'Else']]);
    $fulfil = app(FulfilCheckout::class);
    $r = $fulfil->fulfil($session);
    $fulfil->followUp($session, $r, fn () => null);
    $fulfil->followUp($session, $fulfil->fulfil($session), fn () => null); // a redelivery

    expect(limits($p)['revisions'])->toBe(2)->and(DB::table('users')->count())->toBe($users)
        ->and(DB::table('audit_events')->where('type', 'upsell_buyer_email_mismatch')->count())->toBe(1);
    Queue::assertPushed(SendLifecycleMail::class, 1);
    Queue::assertPushed(SendLifecycleMail::class, fn (SendLifecycleMail $j) => $j->subject === RecordHopelessCheckout::SUBJECT && str_contains($j->intro, 'cs_test_MISMAT01'));
})->group('deviation');

it('sends no admin new-project email for a matching upsell', function () {
    $p = upsellProject();
    $session = upsellSession('cs_test_MATCH001', ['kind' => 'addon', 'projectId' => $p, 'addonKey' => 'extra_revision']);
    $fulfil = app(FulfilCheckout::class);
    $fulfil->followUp($session, $fulfil->fulfil($session), fn () => null);
    expect(DB::table('audit_events')->where('type', 'email_sent:admin_new_project')->count())->toBe(0);
});

// Critic B3 (DV-24, story 5.5 AC 15): a stale-from or downgrade session run through the webhook applies nothing, writes the
// `upgrade_stale_from_package` audit (with its payload) and `checkout_stuck`, and mails the admin once, also on redelivery.
function upsellWebhook(array $session, string $eventId): array
{
    $event = Event::constructFrom(['id' => $eventId, 'object' => 'event', 'type' => 'checkout.session.completed', 'created' => time(), 'data' => ['object' => $session]]);

    return app(ProcessStripeEvent::class)->handle($event);
}

it('alerts the admin and audits, applying nothing, for a stale or downgrade upgrade via the webhook (DV-24)', function (string $from, string $to, string $bought, array $first) {
    $p = upsellProject($bought);
    foreach ($first as $i => $step) {
        app(FulfilCheckout::class)->fulfil(upsellSession('cs_test_PRE'.$i.$bought, ['kind' => 'upgrade', 'projectId' => $p, 'fromPackage' => $step[0], 'toPackage' => $step[1]]));
    }
    $before = limits($p);
    $package = DB::table('projects')->where('id', $p)->value('package_code');
    $ordersBefore = DB::table('project_orders')->count();
    $session = upsellSession('cs_test_STALE001', ['kind' => 'upgrade', 'projectId' => $p, 'fromPackage' => $from, 'toPackage' => $to]);

    [$status, $body] = upsellWebhook($session, 'evt_stale_1');
    [, $again] = upsellWebhook($session, 'evt_stale_1'); // redelivery of the same event
    [$status2] = upsellWebhook($session, 'evt_stale_2'); // a new event for the same session

    expect($status)->toBe(200)->and($body['received'])->toBeTrue()->and($status2)->toBe(200)
        ->and($again['deduped'] ?? null)->toBeTrue()
        ->and(limits($p))->toBe($before)
        ->and(DB::table('projects')->where('id', $p)->value('package_code'))->toBe($package)
        ->and(DB::table('project_orders')->count())->toBe($ordersBefore)
        ->and(DB::table('audit_events')->where('type', 'upgrade_stale_from_package')->where('project_id', $p)->count())->toBe(1)
        ->and(DB::table('audit_events')->where('type', 'checkout_stuck')->where('project_id', $p)->count())->toBe(1)
        ->and(DB::table('audit_events')->where('type', 'package_upgrade_applied')->count())->toBe(count($first));
    $payload = json_decode((string) DB::table('audit_events')->where('type', 'upgrade_stale_from_package')->value('payload'), true);
    expect($payload)->toBeArray()->and($payload['checkoutSessionId'] ?? null)->toBe('cs_test_STALE001');
    Queue::assertPushed(SendLifecycleMail::class, 1);
    Queue::assertPushed(SendLifecycleMail::class, fn (SendLifecycleMail $j) => $j->subject === RecordHopelessCheckout::SUBJECT && str_contains($j->intro, 'cs_test_STALE001'));
})->with([
    'stale: project already upgraded' => ['essential', 'professional', 'essential', [['essential', 'professional']]],
    'downgrade' => ['complete', 'essential', 'complete', []],
    'same tier' => ['professional', 'professional', 'professional', []],
])->group('deviation', 'upsell');

it('does not repeat the mismatch audit on a redelivery when the admin mail is skipped', function () {
    config(['portal.admin_notification_emails' => '']);
    $p = upsellProject();
    $session = upsellSession('cs_test_MISMAT02', ['kind' => 'addon', 'projectId' => $p, 'addonKey' => 'extra_revision'], ['customer_details' => ['email' => 'other@example.test', 'name' => 'O']]);
    $fulfil = app(FulfilCheckout::class);
    $fulfil->followUp($session, $fulfil->fulfil($session), fn () => null);
    $fulfil->followUp($session, $fulfil->fulfil($session), fn () => null);
    expect(DB::table('audit_events')->where('type', 'upsell_buyer_email_mismatch')->count())->toBe(1);
})->group('deviation');

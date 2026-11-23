<?php

use App\Actions\Checkout\Claim;
use App\Actions\Checkout\ClaimStripeEvent;
use App\Actions\Checkout\FulfilCheckout;
use App\Actions\Checkout\FulfilmentResult;
use App\Actions\Checkout\FulfilsCheckout;
use App\Actions\Checkout\RecordHopelessCheckout;
use App\Jobs\SendLifecycleMail;
use App\Support\Stripe\HopelessCheckoutFailure;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Tests\Support\FakeStripe;
use Tests\Support\TruncatesDatabaseAsOwner;

// Stories 5.2 + 5.3 (K-05, K-06; DV-15, DV-21): the webhook route over the REAL FulfilCheckout (Stripe is the
// in-process fake): response fields, the DV-15 audit/alert/dedupe, the lease fence and out-of-order delivery.
// Helpers (signedEvent, postWebhook, WH_SECRET) come from WebhookTest.php, loaded in the same run.
uses(TruncatesDatabaseAsOwner::class);

if (! function_exists('signedEvent')) {
    require_once __DIR__.'/WebhookTest.php';
}

beforeEach(function () {
    Queue::fake();
    config(['services.stripe.webhook_secret' => WH_SECRET, 'mail.default' => 'array', 'mail.from.address' => 'from@example.test',
        'portal.public_site_url' => 'https://portal.example.test', 'portal.admin_notification_emails' => 'ops@example.test']);
});
afterEach(fn () => FakeStripe::uninstall());

function paidSessionFor(string $id, array $over = []): array
{
    return $over + ['id' => $id, 'object' => 'checkout.session', 'payment_status' => 'paid', 'currency' => 'gbp', 'amount_total' => 34900,
        'payment_intent' => 'pi_'.$id, 'customer_details' => ['email' => 'buyer@example.test', 'name' => 'Ada Lovelace'], 'metadata' => []];
}

function whMissingSession(FakeStripe $s): FakeStripe
{
    return $s->respondWith(404, ['error' => ['type' => 'invalid_request_error', 'message' => 'No such checkout session', 'code' => 'resource_missing']]);
}

function whEssentialItems(FakeStripe $s): void
{
    $s->respondWith(200, ['object' => 'list', 'has_more' => false, 'url' => '/x', 'data' => [['id' => 'li_1', 'object' => 'item', 'price' => ['id' => config('catalog.packages.essential.price_id')]]]]);
}

function whAlertsSent(): int
{
    return Queue::pushed(SendLifecycleMail::class, fn (SendLifecycleMail $j) => $j->subject === RecordHopelessCheckout::SUBJECT)->count();
}

it('fulfils through the route with the response fields, and a second event for the same session is deduped', function () {
    whEssentialItems(FakeStripe::install());
    [$p, $s] = signedEvent('checkout.session.completed', paidSessionFor('cs_test_AAAAAAAA'), 'evt_a1');
    $r = postWebhook($p, $s)->assertOk();
    expect($r->json())->toMatchArray(['fulfilled' => true, 'deduped' => false, 'orderStatus' => 'FULFILLED', 'purchaserEmail' => 'buyer@example.test', 'isReturningCustomer' => false])
        ->and($r->json('projectId'))->toBe(DB::table('projects')->value('id'))
        ->and($r->json('provisionedUserId'))->toBe(DB::table('users')->value('id'));

    [$p2, $s2] = signedEvent('checkout.session.completed', paidSessionFor('cs_test_AAAAAAAA'), 'evt_a2');
    $again = postWebhook($p2, $s2)->assertOk();
    expect($again->json())->toMatchArray(['fulfilled' => true, 'deduped' => true, 'isReturningCustomer' => true])
        ->and(DB::table('projects')->count())->toBe(1)->and(DB::table('project_orders')->count())->toBe(1)
        ->and(DB::table('audit_events')->where('type', 'email_sent:checkout_auth:cs_test_AAAAAAAA')->count())->toBe(1)
        ->and(Mail::mailer('array')->getSymfonyTransport()->messages())->toHaveCount(1); // the customer link, once
    Queue::assertPushed(SendLifecycleMail::class, 1); // the admin email, once
});

it('settles an unknown session as permanent and alerts the admin once (DV-15)', function () {
    whMissingSession(FakeStripe::install());
    [$p, $s] = signedEvent('checkout.session.completed', paidSessionFor('cs_test_GHOST0001'), 'evt_ghost');
    expect(postWebhook($p, $s)->json())->toMatchArray(['fulfilled' => false, 'retry' => false])
        ->and(whAlertsSent())->toBe(1);
    expect(postWebhook($p, $s)->json())->toMatchArray(['deduped' => true])
        ->and(whAlertsSent())->toBe(1)->and(DB::table('projects')->count())->toBe(0);
});

it('settles a payment intent owned by another session as permanent and alerts once (DV-15)', function () {
    $stripe = FakeStripe::install();
    whEssentialItems($stripe);
    [$p, $s] = signedEvent('checkout.session.completed', paidSessionFor('cs_test_FIRST001', ['payment_intent' => 'pi_shared']), 'evt_first');
    postWebhook($p, $s)->assertOk();
    whEssentialItems($stripe);
    [$p, $s] = signedEvent('checkout.session.completed', paidSessionFor('cs_test_SECOND01', ['payment_intent' => 'pi_shared']), 'evt_second');
    expect(postWebhook($p, $s)->json())->toMatchArray(['fulfilled' => false, 'retry' => false])
        ->and(whAlertsSent())->toBe(1)
        ->and(DB::table('project_orders')->count())->toBe(1);
    expect(postWebhook($p, $s)->json())->toMatchArray(['deduped' => true])->and(whAlertsSent())->toBe(1);
});

it('audits checkout_stuck and sends the project alert once; a lost claim writes nothing', function () {
    whEssentialItems(FakeStripe::install());
    [$p, $s] = signedEvent('checkout.session.completed', paidSessionFor('cs_test_STUCK001'), 'evt_stuck');
    postWebhook($p, $s)->assertOk();
    $projectId = DB::table('projects')->value('id');
    Queue::fake(); // forget the fulfilment mails

    $claims = new ClaimStripeEvent;
    foreach (['evt_s1', 'evt_s2'] as $i => $id) {
        $claim = $claims->claim($id, 'checkout.session.completed', time());
        expect($claim)->toBeInstanceOf(Claim::class);
        $failure = HopelessCheckoutFailure::paymentIntentReused('cs_test_STUCK001', $projectId);
        if ($i === 1) {
            DB::table('stripe_events')->where('event_id', $id)->update(['type' => 'processing:1:other:checkout.session.completed']); // lease stolen
        }
        app(RecordHopelessCheckout::class)->handle($claim, $failure);
    }

    // evt_s1 audited and alerted; evt_s2 lost its claim, so nothing more (and the marker dedupes anyway).
    expect(DB::table('audit_events')->where('type', 'checkout_stuck')->where('project_id', $projectId)->count())->toBe(1)
        ->and(DB::table('audit_events')->where('type', 'email_sent:payment_attention:cs_test_STUCK001')->count())->toBe(1)
        ->and(whAlertsSent())->toBe(1)
        ->and(DB::table('stripe_events')->where('event_id', 'evt_s1')->value('processed_at'))->not->toBeNull();
});

it('does not alert when no admin address is configured, and says so in the log', function () {
    config(['portal.admin_notification_emails' => '']);
    whMissingSession(FakeStripe::install());
    [$p, $s] = signedEvent('checkout.session.completed', paidSessionFor('cs_test_GHOST0002'), 'evt_ghost2');
    expect(postWebhook($p, $s)->json())->toMatchArray(['retry' => false])->and(whAlertsSent())->toBe(0);
});

it('fulfils an async_payment_succeeded event from the retrieved session (out of order)', function () {
    $stripe = FakeStripe::install();
    $stripe->respondWith(200, paidSessionFor('cs_test_ASYNC001'));
    whEssentialItems($stripe);
    [$p, $s] = signedEvent('checkout.session.async_payment_succeeded', ['id' => 'cs_test_ASYNC001', 'payment_status' => 'unpaid'], 'evt_async');
    expect(postWebhook($p, $s)->json())->toMatchArray(['fulfilled' => true, 'orderStatus' => 'FULFILLED'])
        ->and($stripe->requests[0]['path'])->toContain('/v1/checkout/sessions/cs_test_ASYNC001');
});

it('settles an async event for a session Stripe does not know as permanent (404 → unknown session)', function () {
    whMissingSession(FakeStripe::install());
    [$p, $s] = signedEvent('checkout.session.async_payment_succeeded', ['id' => 'cs_test_ASYNC404'], 'evt_async404');
    expect(postWebhook($p, $s)->json())->toMatchArray(['fulfilled' => false, 'retry' => false])
        ->and(whAlertsSent())->toBe(1);
});

it('settles a payload with no session id as permanent', function () {
    FakeStripe::install();
    [$p, $s] = signedEvent('checkout.session.completed', ['object' => 'checkout.session'], 'evt_noid');
    expect(postWebhook($p, $s)->json())->toMatchArray(['fulfilled' => false, 'retry' => false]);
});

/** Wraps the real fulfiller, running $around(marker-before) just before followUp. */
function whWrapFulfiller(Closure $around): void
{
    $real = app(FulfilCheckout::class);
    app()->bind(FulfilsCheckout::class, fn () => new class($real, $around) implements FulfilsCheckout
    {
        public function __construct(private FulfilCheckout $real, private Closure $around) {}

        public function fulfil(array $session): FulfilmentResult
        {
            return $this->real->fulfil($session);
        }

        public function followUp(array $session, FulfilmentResult $result, Closure $renew): FulfilmentResult
        {
            ($this->around)($session);

            return $this->real->followUp($session, $result, $renew);
        }
    });
}

it('renews the lease while fulfilment runs, and completes under the renewed marker', function () {
    whEssentialItems(FakeStripe::install());
    $seen = [];
    whWrapFulfiller(function () use (&$seen) {
        $seen[] = DB::table('stripe_events')->where('event_id', 'evt_renew')->value('type');
        usleep(5000);
    });
    [$p, $s] = signedEvent('checkout.session.completed', paidSessionFor('cs_test_RENEW001'), 'evt_renew');
    postWebhook($p, $s)->assertOk();

    $row = DB::table('stripe_events')->where('event_id', 'evt_renew')->first();
    expect($seen)->toHaveCount(1)->and($seen[0])->toStartWith('processing:') // renewed once already after fulfil(), still ours
        ->and($row->type)->toBe('checkout.session.completed')->and($row->processed_at)->not->toBeNull();
});

it('aborts before any email when the claim is lost mid-fulfilment (lease fence)', function () {
    whEssentialItems(FakeStripe::install());
    whWrapFulfiller(fn () => DB::table('stripe_events')->where('event_id', 'evt_lost')->update(['type' => 'processing:'.(int) (microtime(true) * 1000).':thief:checkout.session.completed']));
    [$p, $s] = signedEvent('checkout.session.completed', paidSessionFor('cs_test_LOST0001'), 'evt_lost');
    $r = postWebhook($p, $s);

    expect($r->status())->toBe(500)->and($r->json())->toMatchArray(['fulfilled' => false, 'retry' => true]);
    $row = DB::table('stripe_events')->where('event_id', 'evt_lost')->first();
    expect($row->type)->toContain(':thief:')->and($row->processed_at)->toBeNull() // the thief's lease is untouched
        ->and(DB::table('project_orders')->count())->toBe(1) // durable fulfilment stays, so the retry dedupes
        ->and(Mail::mailer('array')->getSymfonyTransport()->messages())->toHaveCount(0)
        ->and(DB::table('audit_events')->where('type', 'like', 'email_sent:%')->count())->toBe(0);
});

<?php

use App\Actions\Checkout\FulfilmentResult;
use App\Actions\Checkout\FulfilsCheckout;
use App\Support\Stripe\FulfilmentError;
use App\Support\Stripe\HopelessCheckoutFailure;
use App\Support\Stripe\WebhookClassifier;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Tests\Support\TruncatesDatabaseAsOwner;

// Story 5.2 (K-05, K-06; ledger rows 52, 109). The fulfiller is a stub: real fulfilment is 5.3.
uses(TruncatesDatabaseAsOwner::class);

const WH_SECRET = 'whsec_test_story_52';

function signedEvent(string $type, array $object, ?string $id = null, ?int $ts = null): array
{
    $ts ??= time();
    $payload = json_encode(['id' => $id ?? 'evt_'.bin2hex(random_bytes(6)), 'object' => 'event', 'type' => $type, 'created' => time(), 'data' => ['object' => $object]]);
    $sig = 't='.$ts.',v1='.hash_hmac('sha256', $ts.'.'.$payload, WH_SECRET);

    return [$payload, $sig];
}

function postWebhook(string $payload, ?string $sig): TestResponse
{
    $headers = ['CONTENT_TYPE' => 'application/json'] + ($sig === null ? [] : ['HTTP_STRIPE_SIGNATURE' => $sig]);

    return test()->call('POST', '/api/stripe/webhook', [], [], [], $headers, $payload);
}

function bindFulfiller(?Throwable $throws): void
{
    app()->bind(FulfilsCheckout::class, fn () => new class($throws) implements FulfilsCheckout
    {
        public function __construct(private ?Throwable $throws) {}

        public function fulfil(array $session): FulfilmentResult
        {
            if ($this->throws) {
                throw $this->throws;
            }

            return new FulfilmentResult('c1', 'p1', 'a@example.test', false, 'FULFILLED');
        }

        public function followUp(array $session, FulfilmentResult $result, Closure $renew): FulfilmentResult
        {
            $renew();

            return $result;
        }
    });
}

beforeEach(fn () => config(['services.stripe.webhook_secret' => WH_SECRET]));

it('answers 400 for a missing secret, signature, or a bad signature', function () {
    [$p, $s] = signedEvent('checkout.session.completed', ['id' => 'cs_1']);
    expect(postWebhook($p, null)->getContent())->toBe('Missing stripe-signature header');
    expect(postWebhook($p, 't=1,v1=bad')->status())->toBe(400);
    expect(postWebhook($p.' ', $s)->getContent())->toStartWith('Webhook signature verification failed');
    config(['services.stripe.webhook_secret' => '']);
    expect(postWebhook($p, $s)->getContent())->toStartWith('STRIPE_WEBHOOK_SECRET not set');
});

it('rejects a signature older than 300 seconds', function () {
    [$p, $s] = signedEvent('checkout.session.completed', ['id' => 'cs_1'], null, time() - 400);
    expect(postWebhook($p, $s)->status())->toBe(400);
});

it('settles ignored and async-failed events once', function () {
    [$p, $s] = signedEvent('customer.created', ['id' => 'cus_1'], 'evt_ign');
    expect(postWebhook($p, $s)->json())->toMatchArray(['received' => true, 'ignored' => true]);
    expect(DB::table('stripe_events')->where('event_id', 'evt_ign')->value('processed_at'))->not->toBeNull();
    [$p, $s] = signedEvent('checkout.session.async_payment_failed', ['id' => 'cs_1'], 'evt_fail');
    expect(postWebhook($p, $s)->json())->toMatchArray(['paymentFailed' => true]);
});

it('fulfils, completes the ledger row, and dedupes a redelivery', function () {
    bindFulfiller(null);
    [$p, $s] = signedEvent('checkout.session.completed', ['id' => 'cs_1'], 'evt_ok');
    $r = postWebhook($p, $s);
    expect($r->status())->toBe(200)->and($r->json())->toMatchArray(['fulfilled' => true, 'projectId' => 'p1']);
    $row = DB::table('stripe_events')->where('event_id', 'evt_ok')->first();
    expect($row->type)->toBe('checkout.session.completed')->and($row->processed_at)->not->toBeNull();
    expect(postWebhook($p, $s)->json())->toMatchArray(['deduped' => true]);
});

it('answers 409 while another delivery holds a live lease, and reclaims an expired one', function () {
    bindFulfiller(null);
    [$p, $s] = signedEvent('checkout.session.completed', ['id' => 'cs_1'], 'evt_lease');
    $live = 'processing:'.(int) (microtime(true) * 1000).':u:checkout.session.completed';
    DB::table('stripe_events')->insert(['event_id' => 'evt_lease', 'type' => $live, 'created_at' => now()]);
    expect(postWebhook($p, $s)->status())->toBe(409);
    DB::table('stripe_events')->where('event_id', 'evt_lease')->update(['type' => 'processing:1000:u:checkout.session.completed']);
    expect(postWebhook($p, $s)->status())->toBe(200);
});

it('releases the claim on a transient failure and settles a permanent one', function () {
    bindFulfiller(new FulfilmentError('db down', 'ETIMEDOUT'));
    [$p, $s] = signedEvent('checkout.session.completed', ['id' => 'cs_1'], 'evt_tr');
    expect(postWebhook($p, $s)->status())->toBe(500);
    expect(DB::table('stripe_events')->where('event_id', 'evt_tr')->exists())->toBeFalse();

    bindFulfiller(new FulfilmentError('Checkout session is not paid', 'CHECKOUT_SESSION_NOT_PAID'));
    [$p, $s] = signedEvent('checkout.session.completed', ['id' => 'cs_2'], 'evt_perm');
    $r = postWebhook($p, $s);
    expect($r->status())->toBe(200)->and($r->json())->toMatchArray(['fulfilled' => false, 'retry' => false]);
    expect(DB::table('stripe_events')->where('event_id', 'evt_perm')->value('processed_at'))->not->toBeNull();
});

it('settles an unknown session as permanent without a project', function () {
    bindFulfiller(HopelessCheckoutFailure::unknownSession('cs_ghost'));
    [$p, $s] = signedEvent('checkout.session.completed', ['id' => 'cs_ghost'], 'evt_ghost');
    expect(postWebhook($p, $s)->json())->toMatchArray(['fulfilled' => false, 'retry' => false]);
    expect(postWebhook($p, $s)->json())->toMatchArray(['deduped' => true]);
});

it('classifies errors as Next does', function (string $message, ?string $code, bool $permanent, string $reason) {
    $e = $code === null ? new RuntimeException($message) : new FulfilmentError($message, $code);
    $c = WebhookClassifier::classify($e);
    expect($c->permanent)->toBe($permanent)->and($c->reason)->toBe($reason);
})->with([
    ['x', 'ETIMEDOUT', false, 'transient_code:ETIMEDOUT'],
    ['Request timeout', null, false, 'transient_message'],
    ['Checkout session is not paid', 'CHECKOUT_SESSION_NOT_PAID', true, 'permanent_payload'],
    ['Malformed Stripe event payload', null, true, 'permanent_payload'],
    ['something odd', null, false, 'default_transient'],
]);

it('exempts only the webhook from the Origin guard among Stripe routes', function () {
    [$p, $s] = signedEvent('customer.created', ['id' => 'cus_1']);
    $r = test()->call('POST', '/api/stripe/webhook', [], [], [], ['HTTP_ORIGIN' => 'https://evil.example', 'HTTP_STRIPE_SIGNATURE' => $s], $p);
    expect($r->status())->toBe(200);
});

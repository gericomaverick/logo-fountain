<?php

use App\Actions\Checkout\FulfilCheckout;
use App\Support\Stripe\FulfilmentError;
use App\Support\Stripe\HopelessCheckoutFailure;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Tests\Support\FakeStripe;
use Tests\Support\TruncatesDatabaseAsOwner;

// Story 5.3 (K-06, K-07; DV-15, DV-25): fulfilment of a paid session. Stripe is the in-process fake.
uses(TruncatesDatabaseAsOwner::class);

beforeEach(function () {
    Queue::fake();
    config(['mail.default' => 'array', 'mail.from.address' => 'from@example.test', 'portal.public_site_url' => 'https://portal.example.test',
        'portal.admin_notification_emails' => 'ops@example.test']);
});
afterEach(fn () => FakeStripe::uninstall());

function paidSession(array $over = []): array
{
    return $over + ['id' => 'cs_test_ABCDEFGH12345678', 'payment_status' => 'paid', 'currency' => 'gbp', 'amount_total' => 34900,
        'payment_intent' => 'pi_1', 'customer_details' => ['email' => ' Buyer@Example.test ', 'name' => 'Ada Lovelace'], 'metadata' => []];
}

function lineItems(FakeStripe $s, array $priceIds): void
{
    $s->respondWith(200, ['object' => 'list', 'has_more' => false, 'url' => '/x', 'data' => array_map(fn ($p) => ['id' => 'li_'.$p, 'object' => 'item', 'price' => ['id' => $p]], $priceIds)]);
}

it('fulfils a paid session once: client, project, entitlements, order, audit', function () {
    $s = FakeStripe::install();
    lineItems($s, [config('catalog.packages.professional.price_id')]);
    $r = app(FulfilCheckout::class)->fulfil(paidSession());

    expect($r->deduped)->toBeFalse()->and($r->orderStatus)->toBe('FULFILLED')->and($r->purchaserEmail)->toBe('buyer@example.test');
    expect(DB::table('clients')->value('slug'))->toBe('ada-lovelace-12345678');
    expect(DB::table('projects')->value('status'))->toBe('AWAITING_BRIEF');
    expect(DB::table('project_entitlements')->pluck('limit_int', 'key')->all())->toBe(['concepts' => 2, 'revisions' => 2]);
    expect(DB::table('audit_events')->pluck('type')->sort()->values()->all())->toBe(['order_fulfilled', 'state_changed']);

    $again = app(FulfilCheckout::class)->fulfil(paidSession());
    expect($again->deduped)->toBeTrue()->and(DB::table('projects')->count())->toBe(1)->and(DB::table('project_orders')->count())->toBe(1);
});

it('refuses anything but paid; no_payment_required is permanent', function () {
    FakeStripe::install();
    expect(fn () => app(FulfilCheckout::class)->fulfil(paidSession(['payment_status' => 'unpaid'])))->toThrow(FulfilmentError::class, 'not paid');
    expect(fn () => app(FulfilCheckout::class)->fulfil(paidSession(['payment_status' => 'no_payment_required'])))->toThrow(HopelessCheckoutFailure::class);
    expect(DB::table('projects')->count())->toBe(0);
});

it('needs exactly one allowlisted price', function () {
    $s = FakeStripe::install();
    lineItems($s, ['price_unknown']);
    expect(fn () => app(FulfilCheckout::class)->fulfil(paidSession()))->toThrow(FulfilmentError::class, 'allowlisted package');
    expect(DB::table('clients')->count())->toBe(0);
});

it('marks the order NEEDS_CONTACT without an email and provisions nobody', function () {
    $s = FakeStripe::install();
    lineItems($s, [config('catalog.packages.essential.price_id')]);
    $r = app(FulfilCheckout::class)->fulfil(paidSession(['customer_details' => ['name' => 'No Mail']]));
    expect($r->orderStatus)->toBe('NEEDS_CONTACT')->and($r->purchaserEmail)->toBeNull();
    $r = app(FulfilCheckout::class)->followUp(paidSession(), $r, fn () => null);
    expect(DB::table('users')->count())->toBe(0);
});

it('provisions access and sends each email once across retries', function () {
    $s = FakeStripe::install();
    lineItems($s, [config('catalog.packages.essential.price_id')]);
    $f = app(FulfilCheckout::class);
    $r = $f->fulfil(paidSession());
    $renewed = 0;
    $f->followUp(paidSession(), $r, function () use (&$renewed) {
        $renewed++;
    });
    $f->followUp(paidSession(), $r, fn () => null);

    expect(DB::table('users')->where('email', 'buyer@example.test')->whereNull('password')->count())->toBe(1)
        ->and(DB::table('client_memberships')->value('role'))->toBe('owner')
        ->and(DB::table('profiles')->value('is_admin'))->toBeFalse()
        ->and($renewed)->toBeGreaterThan(0);
    expect(DB::table('audit_events')->where('type', 'email_sent:checkout_auth:cs_test_ABCDEFGH12345678')->count())->toBe(1);
    expect(DB::table('audit_events')->where('type', 'email_sent:admin_new_project')->count())->toBe(1);
});

<?php

use App\Support\ErrorCodes;
use Illuminate\Support\Facades\Log;
use Tests\Support\FakeStripe;

// Story 5.1 (K-01, K-13, DV-1, DV-5, DV-20; contract checkout-contracts.spec.ts start cases). Stripe is FakeStripe:
// nothing leaves the process and no key but a made-up sk_test_ value exists.

const CANONICAL = 'https://portal.example.test';
const MARKETING = 'https://www.example.test';
const SESSION_URL = 'https://checkout.stripe.test/c/pay/cs_test_fake_1';

beforeEach(function () {
    config(['portal.public_site_url' => CANONICAL, 'portal.public_marketing_site_url' => MARKETING]);
    $this->stripe = FakeStripe::install();
});
afterEach(fn () => FakeStripe::uninstall());

it('creates one payment session with the documented shape and redirects 303 to Stripe', function () {
    $r = $this->get('/checkout/start?package_code=complete&campaign_slug=x');

    $r->assertStatus(303)->assertRedirect(SESSION_URL);
    expect($this->stripe->requests)->toHaveCount(1)
        ->and($this->stripe->requests[0]['method'])->toBe('POST')
        ->and($this->stripe->requests[0]['path'])->toBe('/v1/checkout/sessions');
    $p = $this->stripe->onlyParams();
    expect($p)->toMatchArray([
        'mode' => 'payment',
        'customer_creation' => 'always',
        'billing_address_collection' => 'auto',
        'phone_number_collection' => ['enabled' => 'false'], // stripe-php puts booleans on the wire as text
        'invoice_creation' => ['enabled' => 'true'],
        'line_items' => [['price' => 'price_1ToTGBFM0K9Qd7oX2D5r9Z6i', 'quantity' => 1]],
        'metadata' => ['package_code' => 'complete', 'campaign_slug' => 'x'],
    ]);
    $name = fn (string $key, string $label) => [
        'key' => $key, 'label' => ['type' => 'custom', 'custom' => $label], 'type' => 'text',
        'text' => ['minimum_length' => 1, 'maximum_length' => 80], 'optional' => 'false',
    ];
    expect($p['custom_fields'])->toBe([$name('first_name', 'First name'), $name('last_name', 'Last name')]);
});

it('is anonymous: no cookie, no session', function () {
    $r = $this->get('/checkout/start?package_code=essential');

    $r->assertStatus(303);
    expect($r->baseResponse->headers->getCookies())->toBe([]);
});

it('sends the right price for each package', function (string $code, string $price) {
    $this->get('/checkout/start?package_code='.$code)->assertStatus(303);

    expect($this->stripe->onlyParams()['line_items'])->toBe([['price' => $price, 'quantity' => 1]]);
})->with([
    ['essential', 'price_1ToTEhFM0K9Qd7oXM0WRTWjd'],
    ['professional', 'price_1ToTFQFM0K9Qd7oXmHYwoZAT'],
    ['complete', 'price_1ToTGBFM0K9Qd7oX2D5r9Z6i'],
]);

it('rejects anything but an exact package code, a raw price ID included, with no Stripe call', function (?string $query) {
    $r = $this->get('/checkout/start'.($query === null ? '' : '?'.$query));

    $r->assertStatus(400)->assertExactJson(['error' => [
        'message' => 'Invalid package_code. Expected one of: essential, professional, complete',
        'code' => ErrorCodes::INVALID_PACKAGE,
    ]]);
    expect($this->stripe->requests)->toBe([]);
})->with([
    'absent' => [null],
    'empty' => ['package_code='],
    'upper case' => ['package_code=ESSENTIAL'],
    'capitalised' => ['package_code=Complete'],
    'padded' => ['package_code=%20complete'],
    'a price id' => ['package_code=price_1ToTGBFM0K9Qd7oX2D5r9Z6i'],
    'an array' => ['package_code[]=complete'],
    'unknown' => ['package_code=enterprise'],
]);

it('trims the campaign slug, omits it when empty and cuts it to 80 characters', function (string $raw, ?string $expected) {
    $this->get('/checkout/start?package_code=essential&campaign_slug='.rawurlencode($raw))->assertStatus(303);

    $meta = $this->stripe->onlyParams()['metadata'];
    expect($meta['package_code'])->toBe('essential');
    $expected === null ? expect($meta)->not->toHaveKey('campaign_slug') : expect($meta['campaign_slug'])->toBe($expected);
})->with([
    'trimmed' => ["  spring-sale \u{A0}\n", 'spring-sale'],
    'blank' => ['   ', null],
    'empty' => ['', null],
    'long' => [str_repeat('a', 100), str_repeat('a', 80)],
    'counts UTF-16 units' => [str_repeat('a', 79).'😀', str_repeat('a', 79).'?'],
]);

it('omits the slug when the parameter is absent', function () {
    $this->get('/checkout/start?package_code=essential')->assertStatus(303);

    expect($this->stripe->onlyParams()['metadata'])->toBe(['package_code' => 'essential']);
});

it('answers 500 CHECKOUT_URL_MISSING when the session has no URL', function () {
    $this->stripe->respondWith(200, ['id' => 'cs_test_x', 'object' => 'checkout.session', 'url' => null]);

    $this->get('/checkout/start?package_code=essential')->assertStatus(500)->assertExactJson(['error' => [
        'message' => 'Failed to create checkout session URL',
        'code' => ErrorCodes::CHECKOUT_URL_MISSING,
    ]]);
});

// @deviation DV-1 (K-13): Next sends no allow_promotion_codes (checkout/start/route.ts:31-62).
it('allows promotion codes on the session', function () {
    $this->get('/checkout/start?package_code=professional')->assertStatus(303);

    expect($this->stripe->onlyParams()['allow_promotion_codes'])->toBe('true');
})->group('deviation');

// @deviation DV-5: Next derives success_url from the request (route.ts:27,36) and cancel falls back to it (:28,37).
it('builds the return URLs from config, whatever the request claims', function () {
    $this->withHeaders(['X-Forwarded-Host' => 'evil.example', 'X-Forwarded-Proto' => 'http', 'Forwarded' => 'host=evil.example'])
        ->get('http://attacker.example/checkout/start?package_code=essential')->assertStatus(303);

    $p = $this->stripe->onlyParams();
    expect($p['success_url'])->toBe(CANONICAL.'/checkout/success?session_id={CHECKOUT_SESSION_ID}')
        ->and($p['cancel_url'])->toBe(MARKETING.'/#packages');
})->group('deviation');

it('cancels to the canonical origin when no marketing URL is configured', function () {
    config(['portal.public_marketing_site_url' => null]);

    $this->get('/checkout/start?package_code=essential')->assertStatus(303);

    expect($this->stripe->onlyParams()['cancel_url'])->toBe(CANONICAL.'/#packages');
})->group('deviation');

it('answers 503 PUBLIC_SITE_URL_REQUIRED, without a Stripe call, when no canonical origin can be derived', function () {
    config(['portal.public_site_url' => 'not a url']);

    $this->get('/checkout/start?package_code=essential')->assertStatus(503)->assertJsonPath('error.code', ErrorCodes::PUBLIC_SITE_URL_REQUIRED);
    expect($this->stripe->requests)->toBe([]);
});

// @deviation DV-20: Next returns Stripe's own error.message (route.ts:68-69).
it('answers a fixed 500 and keeps Stripe\'s text out of the response, in the log only', function () {
    Log::spy();
    $this->stripe->failWith('No such price: price_internal_detail');

    $r = $this->get('/checkout/start?package_code=essential');

    $r->assertStatus(500)->assertExactJson(['error' => [
        'message' => 'Unable to create checkout session',
        'code' => ErrorCodes::CHECKOUT_SESSION_FAILED,
        'details' => ['nextStep' => 'Verify Stripe configuration and retry.'],
    ]]);
    expect($r->getContent())->not->toContain('No such price');
    Log::shouldHaveReceived('error')->withArgs(fn ($m, $ctx) => str_contains($ctx['message'] ?? '', 'No such price'))->once();
})->group('deviation');

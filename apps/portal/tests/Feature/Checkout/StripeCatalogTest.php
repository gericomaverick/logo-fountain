<?php

use App\Support\Stripe\StripeCatalog;

// Story 5.1 (K-01): the package price map and placeholder detection (`stripe-price-allowlist.ts`).

it('maps the three package codes to the catalogue the fake serves', function () {
    $fixture = json_decode((string) file_get_contents('/var/www/parity-fixtures/stripe/prices.json'), true, 512, JSON_THROW_ON_ERROR);
    $fakeIds = array_column($fixture['prices'], 'id');
    $catalog = StripeCatalog::fromConfig();

    expect($catalog->packageCodes())->toBe(['essential', 'professional', 'complete']);
    foreach ($catalog->packageCodes() as $code) {
        expect($fakeIds)->toContain($catalog->priceIdForPackage($code));
    }
});

it('keeps the display price beside the price ID', function () {
    expect(config('catalog.packages.essential.display_price'))->toBe('£349')
        ->and(config('catalog.packages.professional.display_price'))->toBe('£795')
        ->and(config('catalog.packages.complete.display_price'))->toBe('£1,495');
});

it('matches codes exactly', function (?string $code) {
    expect(StripeCatalog::fromConfig()->priceIdForPackage($code))->toBeNull();
})->with([[null], [''], ['Essential'], ['ESSENTIAL'], [' essential'], ['price_1ToTEhFM0K9Qd7oXM0WRTWjd'], ['__proto__'], ['0']]);

it('detects placeholder price IDs', function (?string $id, bool $placeholder) {
    expect(StripeCatalog::isPlaceholder($id))->toBe($placeholder);
})->with([[null, true], ['', true], ['  ', true], ['price_REPLACE_ME', true], ['price_replace_me', true], ['price_1ToTEhFM0K9Qd7oXM0WRTWjd', false]]);

it('lists the placeholders in the map', function () {
    $catalog = new StripeCatalog([
        'essential' => ['price_id' => 'price_real', 'display_price' => '£1'],
        'complete' => ['price_id' => 'REPLACE_WITH_PRICE', 'display_price' => '£2'],
    ]);

    expect($catalog->placeholders())->toBe([['scope' => 'package', 'key' => 'complete', 'priceId' => 'REPLACE_WITH_PRICE']]);
});

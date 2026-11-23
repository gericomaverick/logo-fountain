<?php

// Story 5.1 (K-01, K-08): the server-side price map, beside the display price so the label and the charge change
// together (K-08's note). Package codes are the only thing a caller sends; a raw price ID is never accepted.
// The IDs are Next's `lib/stripe-price-allowlist.ts` values, kept so the cutover changes no Stripe object; each can be
// overridden per environment. Tests never call Stripe: they use the fake's fixtures (tests/parity/fixtures/stripe/prices.json).
return [

    'packages' => [
        'essential' => ['price_id' => env('STRIPE_PRICE_ESSENTIAL', 'price_1ToTEhFM0K9Qd7oXM0WRTWjd'), 'display_price' => '£349'],
        'professional' => ['price_id' => env('STRIPE_PRICE_PROFESSIONAL', 'price_1ToTFQFM0K9Qd7oXmHYwoZAT'), 'display_price' => '£795'],
        'complete' => ['price_id' => env('STRIPE_PRICE_COMPLETE', 'price_1ToTGBFM0K9Qd7oX2D5r9Z6i'), 'display_price' => '£1,495'],
    ],

];

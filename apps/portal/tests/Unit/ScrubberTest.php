<?php

// Story 1.6 (X-14, NFR-S3): the scrubber removes tokens, signed URLs and secrets, with real shapes.

use App\Support\Scrubber;

const SCRUBBED = Scrubber::REDACTED;

it('redacts presigned R2/S3 URLs (the whole query)', function () {
    $url = 'https://abc123.r2.cloudflarestorage.com/portal-concepts/7f0c/2b9d/v2.png'
        .'?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD'
        .'&X-Amz-Credential=AKIAEXAMPLE%2F20261120%2Fauto%2Fs3%2Faws4_request&X-Amz-Date=20261120T084100Z'
        .'&X-Amz-Expires=300&X-Amz-Signature=5d672d79c15b13162d9279b0855cfba6789a8edb4c82c400e06b5924a6f2b5d7'
        .'&X-Amz-SignedHeaders=host&x-id=GetObject';

    expect(Scrubber::scrubString("Fetched {$url} in 30 ms"))
        ->toBe('Fetched https://abc123.r2.cloudflarestorage.com/portal-concepts/7f0c/2b9d/v2.png?'.SCRUBBED.' in 30 ms');
});

it('redacts Laravel signed URLs and auth links with the token in the fragment', function () {
    expect(Scrubber::scrubString('https://portal.test/files/9?expires=1763627000&signature=0b6f1a2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f5061728394a5b6c7d8e'))
        ->toBe('https://portal.test/files/9?'.SCRUBBED)
        ->and(Scrubber::scrubString('link: https://portal.logofountain.co.uk/auth/callback#token=Qm9vZ2llV29vZ2llMTIzNDU2Nzg5MA_-x&next=%2Fdashboard'))
        ->toBe('link: https://portal.logofountain.co.uk/auth/callback#'.SCRUBBED)
        ->and(Scrubber::scrubString('https://portal.test/set-password#token=abcdefghijklmnopqrstuv&next=/dashboard'))
        ->toBe('https://portal.test/set-password#'.SCRUBBED);
});

it('redacts a sensitive parameter outside a full URL', function () {
    expect(Scrubber::scrubString('path=/reset-password#token=abcdefghijklmnopqrstuvwx&next=/dashboard'))
        ->toBe('path=/reset-password#token='.SCRUBBED.'&next=/dashboard')
        ->and(Scrubber::scrubString('/checkout/success?session_id=cs_test_a1B2c3D4e5F6g7H8'))
        ->toBe('/checkout/success?session_id='.SCRUBBED);
});

it('keeps URLs without credentials unchanged', function () {
    $plain = 'https://portal.test/projects/7f0c?tab=concepts&page=2';

    expect(Scrubber::scrubString($plain))->toBe($plain);
});

it('redacts bearer and basic credentials but not ordinary words', function () {
    expect(Scrubber::scrubString('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl'))
        ->toBe('Authorization: Bearer '.SCRUBBED)
        ->and(Scrubber::scrubString('Authorization: Basic dXNlcjpwYXNzd29yZA=='))
        ->toBe('Authorization: Basic '.SCRUBBED)
        ->and(Scrubber::scrubString('Basic information about bearer bonds'))
        ->toBe('Basic information about bearer bonds');
});

it('redacts Stripe keys, webhook secrets, checkout session ids and JWTs', function () {
    $sk = 'sk_'.'live_51Hx9QkLmNoPqRsTuVwXyZ0123456789';
    $rk = 'rk_'.'test_51Hx9QkLmNoPqRsTuVwXyZ';
    $wh = 'whsec_'.'5f2a9c0e1b3d4f6a8c0e2b4d6f8a0c2e';

    expect(Scrubber::scrubString("key {$sk} and {$rk}"))->toBe('key '.SCRUBBED.' and '.SCRUBBED)
        ->and(Scrubber::scrubString("secret={$wh}"))->toBe('secret='.SCRUBBED)
        ->and(Scrubber::scrubString('session cs_live_b1C2d3E4f5G6h7I8j9K0'))->toBe('session '.SCRUBBED)
        ->and(Scrubber::scrubString('jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl end'))->toBe('jwt '.SCRUBBED.' end');
});

it('keeps Stripe event and publishable ids, UUIDs and error codes', function () {
    $s = 'evt_1Q2w3E4r5T6y7U8i pk_test_51Hx9Qk 7f0c2b9d-1a2b-4c3d-8e9f-0a1b2c3d4e5f AUTH_FAILED';

    expect(Scrubber::scrubString($s))->toBe($s);
});

it('masks email addresses to the first character and the domain', function () {
    expect(Scrubber::scrubString('Provisioned client.a@parity.test and Mat.Doidge+lf@example.co.uk'))
        ->toBe('Provisioned c***@parity.test and M***@example.co.uk');
});

it('redacts values under sensitive keys, at any depth', function () {
    $out = Scrubber::scrub([
        'email' => 'client.a@parity.test',
        'password' => 'Parity-Next-2026!',
        'newPassword' => 'Another-Pass-1',
        'current_password' => 'x',
        'token' => 'Qm9vZ2llV29vZ2llMTIzNDU2Nzg5MA',
        'tokenHash' => str_repeat('a', 64),
        'headers' => ['Authorization' => ['Bearer abc'], 'Cookie' => 'logo-fountain-session=abc', 'X-CSRF-TOKEN' => 'abc', 'accept' => 'application/json'],
        'stripe' => ['api_key' => 'k', 'Stripe-Signature' => 't=1,v1=abc', 'sessionId' => 'cs_test_x'],
        'id' => 'evt_1',
        'count' => 3,
        'empty' => '',
        'nothing' => null,
    ]);

    expect($out)->toBe([
        'email' => 'c***@parity.test',
        'password' => SCRUBBED,
        'newPassword' => SCRUBBED,
        'current_password' => SCRUBBED,
        'token' => SCRUBBED,
        'tokenHash' => SCRUBBED,
        'headers' => ['Authorization' => SCRUBBED, 'Cookie' => SCRUBBED, 'X-CSRF-TOKEN' => SCRUBBED, 'accept' => 'application/json'],
        'stripe' => ['api_key' => SCRUBBED, 'Stripe-Signature' => SCRUBBED, 'sessionId' => SCRUBBED],
        'id' => 'evt_1',
        'count' => 3,
        'empty' => '',
        'nothing' => null,
    ]);
});

it('turns exceptions into scrubbed arrays without frame arguments', function () {
    $inner = new RuntimeException('GET https://r2.test/o?X-Amz-Signature=abc failed');
    $out = Scrubber::scrub(['exception' => new LogicException('for client.a@parity.test', 7, $inner)]);

    expect($out['exception'])->toMatchArray([
        'class' => LogicException::class,
        'message' => 'for c***@parity.test',
        'code' => 7,
    ])->and($out['exception']['previous']['message'])->toBe('GET https://r2.test/o?'.SCRUBBED.' failed')
        ->and($out['exception']['trace'])->each->toBeString();
});

it('is idempotent', function () {
    $s = 'https://portal.test/auth/callback#token=abcdefghijklmnopqrstuv Bearer abc client.a@parity.test sk_'.'test_abc123';
    $once = Scrubber::scrubString($s);

    expect(Scrubber::scrubString($once))->toBe($once)
        ->and(Scrubber::scrub(Scrubber::scrub(['password' => 'p', 'note' => $s])))->toBe(Scrubber::scrub(['password' => 'p', 'note' => $s]));
});

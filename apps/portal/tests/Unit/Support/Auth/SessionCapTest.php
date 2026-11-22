<?php

use App\Support\Auth\SessionCap;

// Story 4.1 AC 2 (A-04): valid iff now < issued_at + 604800 s (service.ts:18).

it('is exactly seven days', fn () => expect(SessionCap::SECONDS)->toBe(7 * 24 * 3600));

it('applies the absolute cap at the boundary', function (int $age, bool $live) {
    expect(SessionCap::isLive(1_000_000, 1_000_000 + $age))->toBe($live);
})->with([
    'fresh' => [0, true],
    '6d 23h 59m 59s' => [604799, true],
    'exactly 7d' => [604800, false],
    '7d + 1s' => [604801, false],
]);

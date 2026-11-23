<?php

use App\Support\Auth\PasswordRules;

// Story 4.6 (A-07; Next validation.ts:30-43): min 8 JS characters (UTF-16 units), max 72 bytes.

it('accepts and refuses at the length edges', function (string $password, bool $ok) {
    expect(PasswordRules::isAcceptable($password))->toBe($ok);
})->with([
    '7 chars' => [str_repeat('a', 7), false],
    '8 chars' => [str_repeat('a', 8), true],
    '72 bytes' => [str_repeat('a', 72), true],
    '73 bytes' => [str_repeat('a', 73), false],
    'empty' => ['', false],
    '24 two-byte chars = 48 bytes' => [str_repeat('é', 24), true],
    '36 two-byte chars = 72 bytes' => [str_repeat('é', 36), true],
    '37 two-byte chars = 74 bytes' => [str_repeat('é', 37), false],
    '4 emoji = 8 UTF-16 units, 16 bytes' => [str_repeat('😀', 4), true],
    '3 emoji = 6 UTF-16 units' => [str_repeat('😀', 3), false],
    '3 CJK = 3 units, 9 bytes' => [str_repeat('漢', 3), false],
    '18 emoji = 72 bytes' => [str_repeat('😀', 18), true],
]);

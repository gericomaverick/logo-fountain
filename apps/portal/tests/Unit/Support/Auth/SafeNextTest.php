<?php

use App\Support\Auth\SafeNext;
use Tests\Support\ParityFixture;

// Story 4.8 AC 1 (A-13; replaces apps/web safe-next.test.ts, ledger): every case of the shared 0.6b fixture
// tests/parity/fixtures/rules/safe-next.json, which the Next suite also runs.

it('agrees with the Next safeAuthNextPath', function (string $fn, mixed $input, mixed $expected) {
    expect($fn)->toBe('safeAuthNextPath')->and($input)->toBeArray();

    /** @var array{raw: string|null, fallback?: string} $input */
    expect(SafeNext::path($input['raw'], $input['fallback'] ?? SafeNext::DEFAULT))->toBe($expected);
})->with(ParityFixture::dataset('safe-next.json'))->group('unit');

it('uses the caller fallback', function () {
    expect(SafeNext::path('//evil', '/login'))->toBe('/login')
        ->and(SafeNext::path(null, '/x'))->toBe('/x')
        ->and(SafeNext::path('/ok', '/x'))->toBe('/ok');
})->group('unit');

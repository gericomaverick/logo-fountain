<?php

use App\Support\Checkout\EntitlementMath;

// Story 5.5 (K-09, DV-2): the limit arithmetic, L1.
it('adds one revision, treating a null or negative limit as 0 first', function (?int $current, int $expected) {
    expect(EntitlementMath::addon($current))->toBe($expected);
})->with([[null, 1], [-3, 1], [0, 1], [1, 2], [5, 6]]);

it('upgrades additively (DV-2) and keeps unlimited unlimited', function (?int $current, int $from, int $to, ?int $expected) {
    expect(EntitlementMath::upgrade($current, $from, $to))->toBe($expected);
})->with([[2, 1, 2, 3], [1, 1, 2, 2], [3, 2, 3, 4], [null, 1, 2, null]]);

it('only treats a rising tier as an upgrade', function () {
    expect(EntitlementMath::isUpgrade(1, 2))->toBeTrue()
        ->and(EntitlementMath::isUpgrade(2, 2))->toBeFalse()
        ->and(EntitlementMath::isUpgrade(3, 2))->toBeFalse();
});

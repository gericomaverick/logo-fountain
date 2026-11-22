<?php

use App\Domain\ProjectStatus;
use Tests\Support\ParityFixture;

// Story 2.3 (X-07, C-03 status; replaces apps/web project-status.test.ts, ledger #104): display and overview
// status agree with every case of the shared 0.6b fixture tests/parity/fixtures/rules/display-status.json.

/** @return array<string, Closure(string, bool, bool): string> */
function displayStatusFixtureFns(): array
{
    return [
        'deriveDisplayProjectStatus' => ProjectStatus::display(...),
        'deriveOverviewBadgeStatus' => ProjectStatus::overviewBadge(...),
    ];
}

it('agrees with the Next display status', function (string $fn, mixed $input, mixed $expected) {
    $fns = displayStatusFixtureFns();
    expect($fns)->toHaveKey($fn, message: "display-status.json has a case for '{$fn}', which this test does not handle")
        ->and($input)->toBeArray();

    /** @var array{persistedStatus: string, hasApprovedConcept: bool, hasFinalDeliverable: bool} $input */
    expect($fns[$fn]($input['persistedStatus'], $input['hasApprovedConcept'], $input['hasFinalDeliverable']))
        ->toBe($expected);
})->with(ParityFixture::dataset('display-status.json'))->group('unit');

it('handles every fn in display-status.json, and only those', function () {
    $inFixture = array_values(array_unique(array_column(ParityFixture::cases('display-status.json'), 'fn')));
    $handled = array_keys(displayStatusFixtureFns());
    sort($inFixture);
    sort($handled);

    expect($inFixture)->toBe($handled);
})->group('unit');

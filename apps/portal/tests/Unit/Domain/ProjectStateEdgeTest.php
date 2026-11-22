<?php

use App\Domain\ProjectState;
use App\Domain\ProjectStatus;
use App\Domain\ProjectTimeline;
use App\Domain\ProjectTransitionError;
use App\Domain\ProjectTransitions;
use Tests\Support\ParityFixture;

// Story 2.3 (X-07): edge cases beyond the shared fixture, and the fixture harness's own failure mode.

it('has exactly the 11 persisted states; APPROVED and near-misses are not states', function () {
    expect(ProjectState::cases())->toHaveCount(11);
    foreach (['APPROVED', '', 'awaiting_brief', ' AWAITING_BRIEF', 'AWAITING_BRIEF ', 'UNKNOWN'] as $notAState) {
        expect(ProjectState::tryFrom($notAState))->toBeNull();
    }
})->group('unit');

it('checks unknown states before the reason rules', function () {
    expect(ProjectTransitions::apply('APPROVED', 'ON_HOLD')->error)->toBe(ProjectTransitionError::InvalidState)
        ->and(ProjectTransitions::apply('IN_DESIGN', 'UNKNOWN', '   ')->error)->toBe(ProjectTransitionError::InvalidState)
        ->and(ProjectTransitions::apply('REFUNDED', 'CANCELLED')->error)->toBe(ProjectTransitionError::ReasonRequired)
        ->and(ProjectTransitions::apply('REFUNDED', 'CANCELLED', 'x')->error)->toBe(ProjectTransitionError::InvalidTransition);
})->group('unit');

it('treats a reason of only JS-trim whitespace as blank, and nothing else', function (string $reason, bool $blank) {
    $result = ProjectTransitions::apply('IN_DESIGN', 'ON_HOLD', $reason);

    expect($result->ok())->toBe(! $blank)
        ->and($result->error)->toBe($blank ? ProjectTransitionError::HoldReasonRequired : null);
})->with([
    'NBSP' => ["\u{00A0}", true],
    'ideographic space' => ["\u{3000}", true],
    'line separator + BOM' => ["\u{2028}\u{FEFF}", true],
    'form feed + vertical tab' => ["\f\v", true],
    'NEL (not JS whitespace)' => ["\u{0085}", false],
    'NUL (PHP trim strips it, JS does not)' => ["\0", false],
    'zero-width space (not JS whitespace)' => ["\u{200B}", false],
])->group('unit');

it('returns the from-state allowed list on refusal and the target copy on success', function () {
    expect(ProjectTransitions::apply('DELIVERED', 'CANCELLED', 'x')->toArray())
        ->toBe(['ok' => false, 'allowed' => ['ON_HOLD', 'REFUNDED'], 'error' => 'INVALID_TRANSITION'])
        ->and(ProjectTransitions::apply('ON_HOLD', 'IN_DESIGN')->toArray())
        ->toBe(['ok' => true, 'from' => 'ON_HOLD', 'to' => 'IN_DESIGN', 'label' => 'In design', 'primaryCta' => 'Design in progress']);
})->group('unit');

it('passes unknown persisted statuses through the display derivation unchanged', function (string $status) {
    foreach ([[false, false], [true, false], [false, true], [true, true]] as [$approved, $final]) {
        expect(ProjectStatus::display($status, $approved, $final))->toBe($status)
            ->and(ProjectStatus::overviewBadge($status, $approved, $final))->toBe($status);
    }
})->with(['UNKNOWN', '', 'awaiting_approval', 'ON_HOLD '])->group('unit');

it('leaves out a timeline step timestamp only when there is none (an empty string is kept)', function () {
    $timeline = ProjectTimeline::build('CANCELLED', ['CANCELLED' => '', 'AWAITING_APPROVAL' => '2026-02-05T00:00:00.000Z']);

    expect(array_column($timeline, 'timestamp', 'state'))
        ->toBe(['AWAITING_APPROVAL' => '2026-02-05T00:00:00.000Z', 'APPROVED' => '2026-02-05T00:00:00.000Z', 'CANCELLED' => '']);
})->group('unit');

it('fails, naming the mount, when the shared fixture directory is missing', function () {
    ParityFixture::cases('state-machine.json', '/nonexistent/parity-fixtures/rules');
})->throws(RuntimeException::class, ParityFixture::RULES_DIR.' (apps/portal/compose.yaml, x-php volumes)')->group('unit');

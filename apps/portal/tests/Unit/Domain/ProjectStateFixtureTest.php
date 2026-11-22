<?php

use App\Domain\ProjectState;
use App\Domain\ProjectTimeline;
use App\Domain\ProjectTransitions;
use Tests\Support\ParityFixture;

// Story 2.3 (X-07; replaces apps/web project-state-machine.test.ts, ledger #103): the PHP state machine agrees
// with every case of the shared 0.6b fixture tests/parity/fixtures/rules/state-machine.json, read in place.

/** @return array<string, Closure(array<string, mixed>): mixed> one PHP call per Next export in the fixture */
function stateMachineFixtureFns(): array
{
    $values = fn (array $states): array => array_map(fn (ProjectState $s): string => $s->value, $states);
    $map = function (Closure $value): array {
        $out = [];
        foreach (ProjectState::cases() as $state) {
            $out[$state->value] = $value($state);
        }

        return $out;
    };
    $str = fn (array $input, string $key): ?string => isset($input[$key]) && is_string($input[$key]) ? $input[$key] : null;

    return [
        'PROJECT_STATES' => fn (): array => $values(ProjectState::cases()),
        'PROJECT_STATE_LABELS' => fn (): array => $map(fn (ProjectState $s): string => $s->label()),
        'PRIMARY_CTA_BY_STATE' => fn (): array => $map(fn (ProjectState $s): string => $s->primaryCta()),
        'getAllowedTransitions' => fn (array $i): array => $values(ProjectTransitions::allowedFrom((string) $str($i, 'from'))),
        'canTransition' => fn (array $i): bool => ProjectTransitions::can((string) $str($i, 'from'), (string) $str($i, 'to')),
        'applyTransition' => fn (array $i): array => ProjectTransitions::apply(
            (string) $str($i, 'current'),
            (string) $str($i, 'next'),
            is_array($i['context'] ?? null) ? $str($i['context'], 'reason') : null,
        )->toArray(),
        'customerActionFor' => fn (array $i): ?string => ProjectState::tryFrom((string) $str($i, 'state'))?->customerAction(),
        'buildTimeline' => fn (array $i): array => ProjectTimeline::build(
            (string) $str($i, 'currentState'),
            is_array($i['timestamps'] ?? null) ? $i['timestamps'] : [],
            is_array($i['options'] ?? null) && ($i['options']['hasApprovedMilestone'] ?? false) === true,
        ),
    ];
}

it('agrees with the Next state machine', function (string $fn, mixed $input, mixed $expected) {
    $fns = stateMachineFixtureFns();
    expect($fns)->toHaveKey($fn, message: "state-machine.json has a case for '{$fn}', which this test does not handle");

    expect($fns[$fn](is_array($input) ? $input : []))->toBe($expected);
})->with(ParityFixture::dataset('state-machine.json'))->group('unit');

it('handles every fn in state-machine.json, and only those', function () {
    $inFixture = array_values(array_unique(array_column(ParityFixture::cases('state-machine.json'), 'fn')));
    $handled = array_keys(stateMachineFixtureFns());
    sort($inFixture);
    sort($handled);

    expect($inFixture)->toBe($handled);
})->group('unit');

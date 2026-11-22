<?php

namespace App\Domain;

/**
 * The client timeline: the 8 flow states plus the `APPROVED` milestone, and the hold/cancel/refund
 * state at the end when the project is in one (story 2.3, X-07; Next `buildTimeline`,
 * `project-state-machine.ts:186-254`). The server snapshot uses it (`project-snapshot.ts:309`);
 * the portal UI's own copy is `resources/js/lib/status.ts` (1.8b).
 */
final class ProjectTimeline
{
    public const string APPROVED = 'APPROVED';

    /**
     * Unknown states draw as `AWAITING_BRIEF`; a persisted `APPROVED` draws as the approved milestone.
     * A step's `timestamp` key is left out when there is none (Next's `undefined`). The
     * `APPROVED` step uses the `AWAITING_APPROVAL` timestamp.
     *
     * @param  array<string, string>  $timestamps  ISO strings keyed by state value
     * @return list<array{state: string, label: string, completed: bool, current: bool, timestamp?: string}>
     */
    public static function build(string $currentState, array $timestamps = [], bool $hasApprovedMilestone = false): array
    {
        $isExplicitApproved = $currentState === self::APPROVED;
        $current = ProjectState::tryFrom($currentState)
            ?? ($isExplicitApproved ? ProjectState::AwaitingApproval : ProjectState::AwaitingBrief);
        $order = ProjectState::flow();

        if (in_array($current, [ProjectState::OnHold, ProjectState::Cancelled, ProjectState::Refunded], true)) {
            $steps = [];
            foreach (self::steps() as [$state, $label, $source]) {
                $steps[] = self::item($state, $label, false, false, $timestamps[$source] ?? null);
            }
            $steps[] = self::item($current->value, $current->label(), false, true, $timestamps[$current->value] ?? null);

            return $steps;
        }

        $approvedReached = $hasApprovedMilestone || $isExplicitApproved
            || $current === ProjectState::FinalFilesReady || $current === ProjectState::Delivered;
        $approvedIsCurrent = $isExplicitApproved || ($current === ProjectState::AwaitingApproval && $approvedReached);
        $currentIdx = (int) array_search($current, $order, true);

        $steps = [];
        foreach (self::steps() as [$state, $label, $source]) {
            if ($state === self::APPROVED) {
                $steps[] = self::item($state, $label, $approvedReached && ! $approvedIsCurrent, $approvedIsCurrent, $timestamps[$source] ?? null);

                continue;
            }
            $idx = (int) array_search(ProjectState::from($state), $order, true);
            $steps[] = self::item(
                $state,
                $label,
                $idx < $currentIdx || ($state === ProjectState::AwaitingApproval->value && $approvedIsCurrent),
                $idx === $currentIdx && ! $approvedIsCurrent,
                $timestamps[$state] ?? null,
            );
        }

        return $steps;
    }

    /**
     * `FLOW_STEPS` (`project-state-machine.ts:27-37`): [state, label, timestamp source].
     *
     * @return list<array{0: string, 1: string, 2: string}>
     */
    private static function steps(): array
    {
        $steps = [];
        foreach (ProjectState::flow() as $state) {
            $steps[] = [$state->value, $state->label(), $state->value];
            if ($state === ProjectState::AwaitingApproval) {
                $steps[] = [self::APPROVED, 'Approved', ProjectState::AwaitingApproval->value];
            }
        }

        return $steps;
    }

    /** @return array{state: string, label: string, completed: bool, current: bool, timestamp?: string} */
    private static function item(string $state, string $label, bool $completed, bool $current, ?string $timestamp): array
    {
        $item = ['state' => $state, 'label' => $label, 'completed' => $completed, 'current' => $current];
        if ($timestamp !== null) {
            $item['timestamp'] = $timestamp;
        }

        return $item;
    }
}

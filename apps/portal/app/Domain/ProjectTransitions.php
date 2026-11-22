<?php

namespace App\Domain;

use App\Support\NodeCompat;

/**
 * The project transition rules over raw persisted strings (story 2.3, X-07; Next
 * `getAllowedTransitions`, `canTransition`, `applyTransition`, `project-state-machine.ts:132-184`).
 * Pure: it decides, it does not write. Lifecycle Actions call `apply()` inside `Db::serializable()`
 * with the `projects.version` guard (ADR-007, ADR-011, story 2.4).
 */
final class ProjectTransitions
{
    /**
     * Where `$from` may go; empty for an unknown state.
     *
     * @return list<ProjectState>
     */
    public static function allowedFrom(string $from): array
    {
        return ProjectState::tryFrom($from)?->allowedTransitions() ?? [];
    }

    public static function can(string $from, string $to): bool
    {
        $target = ProjectState::tryFrom($to);

        return $target !== null && (ProjectState::tryFrom($from)?->canTransitionTo($target) ?? false);
    }

    /**
     * Rule order as Next: unknown state on either side → blank reason for a reason-gated target →
     * the transition table. "Blank" is JS `trim()` blank (NBSP, BOM and the other Unicode spaces
     * count), so a null, empty or whitespace-only reason is refused. Next's
     * `context.onHoldPreviousState` is accepted there but never read, so it is not a parameter here.
     */
    public static function apply(string $current, string $next, ?string $reason = null): ProjectTransition
    {
        $allowed = self::allowedFrom($current);
        $from = ProjectState::tryFrom($current);
        $to = ProjectState::tryFrom($next);

        if ($from === null || $to === null) {
            return ProjectTransition::refused(ProjectTransitionError::InvalidState, $allowed);
        }

        if ($to->requiresReason() && NodeCompat::trimEnv($reason ?? '') === '') {
            return ProjectTransition::refused(
                $to === ProjectState::OnHold ? ProjectTransitionError::HoldReasonRequired : ProjectTransitionError::ReasonRequired,
                $allowed,
            );
        }

        if (! $from->canTransitionTo($to)) {
            return ProjectTransition::refused(ProjectTransitionError::InvalidTransition, $allowed);
        }

        return ProjectTransition::allowed($from, $to);
    }
}

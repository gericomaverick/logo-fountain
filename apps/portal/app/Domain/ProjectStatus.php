<?php

namespace App\Domain;

/**
 * The status a client sees, derived from the persisted one (story 2.3, X-07, C-03; Next
 * `apps/web/src/lib/project-status.ts:9-30`). Takes and returns raw strings: a persisted value that
 * is not a state (legacy `APPROVED`, `""`, anything unknown) passes through unchanged unless a
 * rule below names it, and is never coerced to a known state.
 */
final class ProjectStatus
{
    /** A stored file is not a lifecycle transition: the final phases need approval, an asset and the persisted state. */
    public static function display(string $persisted, bool $hasApprovedConcept, bool $hasFinalDeliverable): string
    {
        $final = [ProjectState::FinalFilesReady->value, ProjectState::Delivered->value];
        if ($hasApprovedConcept && $hasFinalDeliverable && in_array($persisted, $final, true)) {
            return $persisted;
        }

        if ($persisted === 'APPROVED' || in_array($persisted, $final, true)) {
            return ProjectState::AwaitingApproval->value;
        }

        // Some projects stay persisted as CONCEPTS_READY (or REVISIONS_IN_PROGRESS) after approval.
        $preApproval = [ProjectState::ConceptsReady->value, ProjectState::RevisionsInProgress->value];
        if ($hasApprovedConcept && in_array($persisted, $preApproval, true)) {
            return ProjectState::AwaitingApproval->value;
        }

        return $persisted;
    }

    /** The overview badge: `APPROVED` while approved, no final asset yet, and the display status is awaiting approval. */
    public static function overviewBadge(string $persisted, bool $hasApprovedConcept, bool $hasFinalDeliverable): string
    {
        $display = self::display($persisted, $hasApprovedConcept, $hasFinalDeliverable);

        return ! $hasFinalDeliverable && $hasApprovedConcept && $display === ProjectState::AwaitingApproval->value
            ? 'APPROVED'
            : $display;
    }
}

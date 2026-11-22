<?php

namespace App\Domain;

/**
 * The 11 persisted project lifecycle states, in flow order (story 2.3, X-07; Next
 * `apps/web/src/lib/project-state-machine.ts:1-126`). `APPROVED` is not a state: it is a timeline
 * milestone and a legacy persisted value that only the display derivation handles
 * (`ProjectStatus`, `ProjectTimeline`). Pure domain code: no database access (arch test).
 *
 * Unknown strings never become a case: use `tryFrom()` and treat null as "not a state". It is
 * exact and case-sensitive, as Next's `isProjectState` is (`"awaiting_brief"` is not a state).
 */
enum ProjectState: string
{
    case AwaitingBrief = 'AWAITING_BRIEF';
    case BriefSubmitted = 'BRIEF_SUBMITTED';
    case InDesign = 'IN_DESIGN';
    case ConceptsReady = 'CONCEPTS_READY';
    case RevisionsInProgress = 'REVISIONS_IN_PROGRESS';
    case AwaitingApproval = 'AWAITING_APPROVAL';
    case FinalFilesReady = 'FINAL_FILES_READY';
    case Delivered = 'DELIVERED';
    case OnHold = 'ON_HOLD';
    case Cancelled = 'CANCELLED';
    case Refunded = 'REFUNDED';

    /** `PROJECT_STATE_LABELS` (`project-state-machine.ts:39`). */
    public function label(): string
    {
        return match ($this) {
            self::AwaitingBrief => 'Awaiting brief',
            self::BriefSubmitted => 'Brief submitted',
            self::InDesign => 'In design',
            self::ConceptsReady => 'Concepts ready',
            self::RevisionsInProgress => 'Revisions in progress',
            self::AwaitingApproval => 'Awaiting approval',
            self::FinalFilesReady => 'Final files ready',
            self::Delivered => 'Delivered',
            self::OnHold => 'On hold',
            self::Cancelled => 'Cancelled',
            self::Refunded => 'Refunded',
        };
    }

    /** `PRIMARY_CTA_BY_STATE` (`project-state-machine.ts:89`). */
    public function primaryCta(): string
    {
        return match ($this) {
            self::AwaitingBrief => 'Submit brief',
            self::BriefSubmitted, self::InDesign => 'Design in progress',
            self::ConceptsReady => 'Review concepts',
            self::RevisionsInProgress => 'Await revised concepts',
            self::AwaitingApproval => 'Await final upload',
            self::FinalFilesReady => 'Download final files',
            self::Delivered => 'Project completed',
            self::OnHold => 'Resolve hold',
            self::Cancelled => 'Project cancelled',
            self::Refunded => 'Project refunded',
        };
    }

    /**
     * What the customer must do in this state, or null when the work is the designer's
     * (`customerActionFor`, `project-state-machine.ts:84-87`).
     */
    public function customerAction(): ?string
    {
        return match ($this) {
            self::AwaitingBrief, self::ConceptsReady, self::FinalFilesReady => $this->primaryCta(),
            default => null,
        };
    }

    /**
     * The states this one may move to, in Next's order (`TRANSITIONS`, `project-state-machine.ts:103-126`).
     * Note F-13: nothing moves a project to `IN_DESIGN` in Next; the table is kept as it is.
     *
     * @return list<self>
     */
    public function allowedTransitions(): array
    {
        $exits = [self::OnHold, self::Cancelled, self::Refunded];

        return match ($this) {
            self::AwaitingBrief => [self::BriefSubmitted, ...$exits],
            self::BriefSubmitted => [self::InDesign, self::ConceptsReady, ...$exits],
            self::InDesign => [self::ConceptsReady, ...$exits],
            self::ConceptsReady => [self::RevisionsInProgress, self::AwaitingApproval, self::FinalFilesReady, ...$exits],
            self::RevisionsInProgress => [self::ConceptsReady, ...$exits],
            self::AwaitingApproval => [self::FinalFilesReady, ...$exits],
            self::FinalFilesReady => [self::Delivered, ...$exits],
            self::Delivered => [self::OnHold, self::Refunded],
            self::OnHold => [...self::flow(), self::Cancelled, self::Refunded],
            self::Cancelled => [self::Refunded],
            self::Refunded => [],
        };
    }

    public function canTransitionTo(self $to): bool
    {
        return in_array($to, $this->allowedTransitions(), true);
    }

    /** Moving here needs a reason (`ON_HOLD`: hold reason; `CANCELLED`/`REFUNDED`: reason). */
    public function requiresReason(): bool
    {
        return in_array($this, [self::OnHold, self::Cancelled, self::Refunded], true);
    }

    /**
     * The 8 forward-flow states, in order (`buildTimeline`'s `stateOrder`, `project-state-machine.ts:197-206`).
     *
     * @return list<self>
     */
    public static function flow(): array
    {
        return [
            self::AwaitingBrief,
            self::BriefSubmitted,
            self::InDesign,
            self::ConceptsReady,
            self::RevisionsInProgress,
            self::AwaitingApproval,
            self::FinalFilesReady,
            self::Delivered,
        ];
    }
}

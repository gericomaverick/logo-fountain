<?php

namespace App\Domain;

/** Why `ProjectTransitions::apply()` refused a move (Next `applyTransition` error strings, `project-state-machine.ts:142-184`). */
enum ProjectTransitionError: string
{
    /** Either side is not one of the 11 states (checked first). */
    case InvalidState = 'INVALID_STATE';
    /** Moving to `ON_HOLD` with a blank reason. */
    case HoldReasonRequired = 'HOLD_REASON_REQUIRED';
    /** Moving to `CANCELLED` or `REFUNDED` with a blank reason. */
    case ReasonRequired = 'REASON_REQUIRED';
    /** Both are states, but the table does not allow the move. */
    case InvalidTransition = 'INVALID_TRANSITION';
}

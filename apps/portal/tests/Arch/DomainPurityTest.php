<?php

use App\Domain\ProjectState;
use App\Domain\ProjectStatus;
use App\Domain\ProjectTimeline;
use App\Domain\ProjectTransition;
use App\Domain\ProjectTransitionError;
use App\Domain\ProjectTransitions;

// Story 2.3 AC 7 (X-07): the project state machine and status derivation are pure domain code. Transactions,
// the version guard and writes belong to the lifecycle Actions (ADR-007, ADR-011, story 2.4).

// One expectation per class: Pest arch given an array of targets did not report a violation in one of
// them (checked on Pest ^5.3 by adding a DB call to ProjectStatus), so each class gets its own.
foreach ([
    ProjectState::class,
    ProjectTransitionError::class,
    ProjectTransition::class,
    ProjectTransitions::class,
    ProjectTimeline::class,
    ProjectStatus::class,
] as $class) {
    arch(class_basename($class).' never touches the database or models')
        ->expect($class)
        ->not->toUse(['Illuminate\Support\Facades\DB', 'Illuminate\Database', 'App\Models']);
}

<?php

use App\Models\Concept;
use App\Models\FileAsset;
use App\Models\Project;

/*
 * Story 2.2 AC 3, 6 (ADR-020, DV-7): client paths see published and approved concepts only, through one
 * local scope; admin queries (no scope) see every status.
 */

dataset('statuses', [
    Concept::STATUS_DRAFT => [Concept::STATUS_DRAFT, false],
    Concept::STATUS_PUBLISHED => [Concept::STATUS_PUBLISHED, true],
    Concept::STATUS_APPROVED => [Concept::STATUS_APPROVED, true],
    Concept::STATUS_ARCHIVED => [Concept::STATUS_ARCHIVED, false],
    Concept::STATUS_DELETED => [Concept::STATUS_DELETED, false],
]);

it('returns a concept through the client scope only when it is client-visible', function (string $status, bool $visible) {
    $concept = Concept::factory()->status($status)->create();
    $project = $concept->project;
    $asset = FileAsset::factory()->forConcept($concept)->create();
    $legacy = FileAsset::factory()->for($project)->create(['path' => "{$project->id}/{$concept->id}.png"]);

    expect(Concept::query()->visibleToClient()->whereKey($concept->id)->exists())->toBe($visible)
        ->and($concept->isVisibleToClient())->toBe($visible)
        ->and($project->clientVisibleConcepts()->find($concept->id)?->id)->toBe($visible ? $concept->id : null)
        ->and($project->clientVisibleAssets()->pluck('id')->sort()->values()->all())
        ->toBe($visible ? collect([$asset->id, $legacy->id])->sort()->values()->all() : [])
        // Not a global scope: an admin query sees it in every status.
        ->and(Concept::query()->whereKey($concept->id)->exists())->toBeTrue()
        ->and($project->concepts()->count())->toBe(1)
        ->and($concept->assets()->count())->toBe(2);
})->with('statuses');

it('returns only published and approved concepts, ordered by number on request', function () {
    $project = Project::factory()->create();
    foreach ([Concept::STATUS_DRAFT, Concept::STATUS_APPROVED, Concept::STATUS_ARCHIVED, Concept::STATUS_PUBLISHED, Concept::STATUS_DELETED] as $status) {
        Concept::factory()->for($project)->status($status)->create();
    }

    expect($project->clientVisibleConcepts()->orderBy('number')->pluck('status')->all())->toBe([Concept::STATUS_APPROVED, Concept::STATUS_PUBLISHED])
        ->and($project->concepts()->count())->toBe(5);
});

it('never reaches final ZIPs, other projects or other concepts through the client asset scope', function () {
    $concept = Concept::factory()->status(Concept::STATUS_PUBLISHED)->create();
    $project = $concept->project;
    $hidden = Concept::factory()->for($project)->status(Concept::STATUS_DRAFT)->create();
    $visible = FileAsset::factory()->forConcept($concept)->create();
    FileAsset::factory()->forConcept($hidden)->create();
    FileAsset::factory()->forConcept($concept, 2)->create(['kind' => FileAsset::KIND_FINAL_ZIP]);
    // Another project's file whose path names this concept: the project match still excludes it.
    FileAsset::factory()->create(['path' => "{$project->id}/{$concept->id}/v9.png"]);

    expect($project->clientVisibleAssets()->pluck('id')->all())->toBe([$visible->id])
        ->and($hidden->assets()->count())->toBe(1);
});

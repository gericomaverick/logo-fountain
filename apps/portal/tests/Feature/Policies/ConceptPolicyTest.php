<?php

use App\Models\ClientMembership;
use App\Models\Concept;
use App\Models\FileAsset;
use App\Models\Profile;
use App\Models\Project;
use App\Models\User;
use App\Policies\ConceptPolicy;
use App\Support\ErrorCodes;
use Illuminate\Auth\Access\Response;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Str;

/*
 * Story 2.2 AC 4 (DV-7, C-20): on a client path, a hidden concept (draft, archived, deleted) or its file is
 * indistinguishable from an id that doesn't exist, for a member and for an admin.
 */

/** @return array{response: array{bool, int|null, string|null, string|null}, concept: string|null, asset: string|null} */
function clientConceptOutcome(User $user, Project $project, string $conceptId, string $assetId): array
{
    $concept = $project->clientVisibleConcepts()->find($conceptId);
    // A concept the scope doesn't return is answered as a missing one: the route has no model to authorise.
    $response = $concept === null ? ConceptPolicy::notFound() : Gate::forUser($user)->inspect('view', $concept);

    return [
        'response' => [$response->allowed(), $response->status(), $response->code(), $response->message()],
        'concept' => $concept?->id,
        'asset' => $project->clientVisibleAssets()->find($assetId)?->id,
    ];
}

/** @return array{User, Project} */
function clientPathCaller(string $who): array
{
    $project = Project::factory()->create();
    $user = $who === 'admin'
        ? Profile::factory()->admin()->create()->user
        : ClientMembership::factory()->create(['client_id' => $project->client_id])->profile->user;

    return [$user, $project];
}

$notFound = [false, 404, ErrorCodes::CONCEPT_NOT_FOUND, 'Concept not found'];

it('answers a hidden concept and its file exactly as an unknown id', function (string $who, string $status) use ($notFound) {
    [$user, $project] = clientPathCaller($who);
    $concept = Concept::factory()->for($project)->status($status)->create();
    $asset = FileAsset::factory()->forConcept($concept)->create();

    $hidden = clientConceptOutcome($user, $project, $concept->id, $asset->id);
    $unknown = clientConceptOutcome($user, $project, (string) Str::uuid7(), (string) Str::uuid7());

    expect($hidden)->toBe($unknown)
        ->and($hidden)->toBe(['response' => $notFound, 'concept' => null, 'asset' => null])
        // The policy itself, given the model, denies it the same way.
        ->and(Gate::forUser($user)->inspect('view', $concept)->code())->toBe(ErrorCodes::CONCEPT_NOT_FOUND)
        ->and(Gate::forUser($user)->inspect('view', $concept)->status())->toBe(404);
})->with(['member', 'admin'])->with([Concept::STATUS_DRAFT, Concept::STATUS_ARCHIVED, Concept::STATUS_DELETED]);

it('allows a visible concept and its file', function (string $who, string $status) {
    [$user, $project] = clientPathCaller($who);
    $concept = Concept::factory()->for($project)->status($status)->create();
    $asset = FileAsset::factory()->forConcept($concept)->create();

    expect(clientConceptOutcome($user, $project, $concept->id, $asset->id))
        ->toBe(['response' => [true, null, null, null], 'concept' => $concept->id, 'asset' => $asset->id]);
})->with(['member', 'admin'])->with([Concept::STATUS_PUBLISHED, Concept::STATUS_APPROVED]);

it('checks the project before the concept: a non-member gets PROJECT_NOT_FOUND', function () {
    $concept = Concept::factory()->status(Concept::STATUS_PUBLISHED)->create();
    $outsider = Profile::factory()->create()->user;

    $response = Gate::forUser($outsider)->inspect('view', $concept);

    expect([$response->allowed(), $response->status(), $response->code()])->toBe([false, 404, ErrorCodes::PROJECT_NOT_FOUND]);
});

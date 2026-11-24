<?php

use App\Models\ClientMembership;
use App\Models\Concept;
use App\Models\FileAsset;
use App\Models\Profile;
use App\Models\Project;
use Tests\Support\SessionRows;
use Tests\Support\TruncatesDatabaseAsOwner;

uses(TruncatesDatabaseAsOwner::class);

// Story 6.7 (C-08, C-09, DV-7, DV-12): the concepts list and assets routes.

beforeEach(fn () => config(['session.driver' => 'database']));

function caSignIn($user): void
{
    $sid = substr(hash('sha256', $user->id), 0, 40);
    SessionRows::insert($sid, $user->id, time(), time(), true);
    test()->withCredentials()->withCookie(config('session.cookie'), $sid);
}

function caMember(Project $project)
{
    return ClientMembership::factory()->create(['client_id' => $project->client_id, 'role' => 'owner'])->profile->user;
}

it('lists published and approved concepts by number with imageKey, hiding the rest', function () {
    $project = Project::factory()->create(['status' => 'CONCEPTS_READY']);
    $two = Concept::factory()->status('published')->create(['project_id' => $project->id, 'number' => 2]);
    $one = Concept::factory()->status('approved')->create(['project_id' => $project->id, 'number' => 1]);
    foreach (['draft', 'deleted', 'archived'] as $i => $status) {
        Concept::factory()->status($status)->create(['project_id' => $project->id, 'number' => 3 + $i]);
    }
    FileAsset::factory()->forConcept($one)->create();
    caSignIn(caMember($project));
    $body = $this->getJson("/api/projects/{$project->id}/concepts")->assertOk()->json();
    expect($body['projectStatus'])->toBe('CONCEPTS_READY')
        ->and(array_column($body['concepts'], 'id'))->toBe([$one->id, $two->id])
        ->and($body['concepts'][0])->toHaveKeys(['imageKey', 'imageUrl', 'revisionVersion'])
        ->and($body['concepts'][1])->not->toHaveKey('imageKey')
        ->and($body['concepts'][1]['imageUrl'])->toBeNull();
});

it('shows every version of a published concept, newest version first', function () {
    $concept = Concept::factory()->status('published')->create();
    $pid = $concept->project_id;
    foreach ([1, 2] as $v) {
        FileAsset::factory()->forConcept($concept)->create(['path' => "{$pid}/{$concept->id}/v{$v}.png"]);
    }
    caSignIn(caMember($concept->project));
    $assets = $this->getJson("/api/projects/{$pid}/concepts/{$concept->id}/assets")->assertOk()->json('assets');
    expect(array_column($assets, 'version'))->toBe([2, 1])
        ->and($assets[0])->toHaveKeys(['path', 'createdAt', 'url', 'notes', 'imageKey'])
        ->and($assets[0]['imageKey'])->not->toBe($assets[1]['imageKey']);
});

it('answers a draft, deleted or archived concept exactly like an unknown one (DV-7)', function (string $status) {
    $concept = Concept::factory()->status($status)->create();
    FileAsset::factory()->forConcept($concept)->create();
    caSignIn(caMember($concept->project));
    $missing = $this->getJson("/api/projects/{$concept->project_id}/concepts/".fake()->uuid().'/assets');
    $hidden = $this->getJson("/api/projects/{$concept->project_id}/concepts/{$concept->id}/assets");
    $hidden->assertStatus(404);
    expect($hidden->json('error.code'))->toBe('CONCEPT_NOT_FOUND')
        ->and($hidden->getContent())->toBe($missing->getContent());
    $this->getJson("/api/projects/{$concept->project_id}/concepts")->assertOk()->assertJsonPath('concepts', []);
})->with(['draft', 'deleted', 'archived']);

it('guards both routes: 401 anonymous, 404 non-member and cross-project concept, admin allowed', function () {
    $concept = Concept::factory()->status('published')->create();
    $other = Project::factory()->create();
    $path = "/api/projects/{$concept->project_id}/concepts";
    $this->getJson($path)->assertStatus(401);
    $this->getJson("{$path}/{$concept->id}/assets")->assertStatus(401);

    caSignIn(ClientMembership::factory()->create()->profile->user);
    $this->getJson($path)->assertStatus(404)->assertJsonPath('error.code', 'PROJECT_NOT_FOUND');
    $this->getJson("{$path}/{$concept->id}/assets")->assertStatus(404)->assertJsonPath('error.code', 'PROJECT_NOT_FOUND');
    $this->getJson('/api/projects/nope/concepts')->assertStatus(404);

    // IDOR: a member of another project cannot read this concept through their own project.
    caSignIn(caMember($other));
    $this->getJson("/api/projects/{$other->id}/concepts/{$concept->id}/assets")->assertStatus(404)->assertJsonPath('error.code', 'CONCEPT_NOT_FOUND');
    expect($this->getJson("/api/projects/{$other->id}/concepts")->json('concepts'))->toBe([]);
});

it('lets an admin read a project, and an unknown project lists empty', function () {
    $concept = Concept::factory()->status('published')->create();
    $admin = Profile::factory()->admin()->create()->user;
    caSignIn($admin);
    $this->getJson("/api/projects/{$concept->project_id}/concepts")->assertOk()->assertJsonCount(1, 'concepts');
    $this->getJson('/api/projects/'.fake()->uuid().'/concepts')->assertOk()->assertExactJson(['concepts' => [], 'projectStatus' => null]);
});

it('signs the file created last for imageUrl, while revisionVersion stays the highest version (Next parity)', function () {
    $concept = Concept::factory()->status('published')->create();
    $pid = $concept->project_id;
    FileAsset::factory()->forConcept($concept)->create(['path' => "{$pid}/{$concept->id}/v2.png", 'created_at' => now()->subHour()]);
    FileAsset::factory()->forConcept($concept)->create(['path' => "{$pid}/{$concept->id}/v1.png", 'created_at' => now()]);
    caSignIn(caMember($concept->project));
    $item = $this->getJson("/api/projects/{$pid}/concepts")->assertOk()->json('concepts.0');
    $assets = $this->getJson("/api/projects/{$pid}/concepts/{$concept->id}/assets")->assertOk()->json('assets');
    expect($item['revisionVersion'])->toBe(2)
        ->and($assets[0]['version'])->toBe(2)
        ->and($assets[1]['version'])->toBe(1)
        ->and($item['imageKey'])->toBe($assets[1]['imageKey'])
        ->and($item['imageUrl'])->toBe($assets[1]['url']);
});

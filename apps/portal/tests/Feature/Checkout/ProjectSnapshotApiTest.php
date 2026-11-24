<?php

use App\Models\ClientMembership;
use App\Models\Project;
use App\Models\ProjectEntitlement;
use Illuminate\Support\Facades\DB;
use Tests\Support\SessionRows;
use Tests\Support\TruncatesDatabaseAsOwner;

uses(TruncatesDatabaseAsOwner::class);

// Story 6.2a (C-02, C-16): the snapshot and entitlements routes.
const PS_SID = 'psdefghijabcdefghijabcdefghijabcdefghij1';

beforeEach(fn () => config(['session.driver' => 'database']));

function psSignIn($user): void
{
    SessionRows::insert(PS_SID, $user->id, time(), time(), true);
    test()->withCredentials()->withCookie(config('session.cookie'), PS_SID);
}

function psMember(Project $project)
{
    return ClientMembership::factory()->create(['client_id' => $project->client_id, 'role' => 'owner'])->profile->user;
}

it('returns the snapshot for a member, with package-default entitlements and absent optional keys', function () {
    $project = Project::factory()->create(['package_code' => 'professional']);
    psSignIn(psMember($project));
    $s = $this->getJson("/api/projects/{$project->id}")->assertOk()->json('snapshot');
    expect($s['projectId'])->toBe($project->id)
        ->and($s['entitlements'])->toBe(['concepts' => 2, 'revisions' => 2])
        ->and($s['entitlementUsage']['concepts'])->not->toHaveKey('unlimited')
        ->and($s)->not->toHaveKeys(['latestMessageAt', 'latestConceptAt'])
        ->and($s['readState'])->toBe([])
        ->and($s['stuck'])->toBeTrue()
        ->and($s['latestBrief'])->toBeNull();
});

it('404s a non-member and a malformed id, 401s anonymous', function () {
    $project = Project::factory()->create();
    $this->getJson("/api/projects/{$project->id}")->assertStatus(401);
    psSignIn(ClientMembership::factory()->create()->profile->user);
    $this->getJson("/api/projects/{$project->id}")->assertStatus(404);
    expect($this->getJson("/api/projects/{$project->id}")->getContent())->toContain('PROJECT_NOT_FOUND');
    $this->getJson('/api/projects/nope')->assertStatus(404);
});

it('reports entitlement remaining clamped at zero', function () {
    $project = Project::factory()->create();
    foreach ([['concepts', 1, 1, 0], ['revisions', 2, 1, 2]] as [$k, $l, $c, $r]) {
        ProjectEntitlement::query()->create(['project_id' => $project->id, 'key' => $k, 'limit_int' => $l, 'consumed_int' => $c, 'reserved_int' => $r]);
    }
    psSignIn(psMember($project));
    $this->getJson("/api/projects/{$project->id}/entitlements")->assertOk()->assertExactJson(['entitlements' => ['concepts' => 0, 'revisions' => 0]]);
    expect(DB::table('project_entitlements')->count())->toBe(2);
});

<?php

use App\Models\ClientMembership;
use App\Models\Project;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Tests\Support\SessionRows;
use Tests\Support\TruncatesDatabaseAsOwner;

uses(TruncatesDatabaseAsOwner::class);

// Story 6.1 (C-02 list, API half): GET /api/projects returns {projects:[{id,status,packageCode}]}, membership-based.
const PL_SID = 'pldefghijabcdefghijabcdefghijabcdefghij1';

beforeEach(fn () => config(['session.driver' => 'database']));

function plSignIn(User $user): void
{
    SessionRows::insert(PL_SID, $user->id, time(), time(), true);
    test()->withCredentials()->withCookie(config('session.cookie'), PL_SID);
}

it('requires a session (401 UNAUTHORIZED)', function () {
    $this->getJson('/api/projects')->assertStatus(401)->assertJsonPath('error.code', 'UNAUTHORIZED');
});

it('lists only the caller\'s projects, newest first, as id/status/packageCode', function () {
    $mine = Project::factory()->create(['status' => 'AWAITING_BRIEF', 'package_code' => 'essential']);
    $newer = Project::factory()->create(['client_id' => $mine->client_id, 'status' => 'CONCEPTS_READY', 'package_code' => 'professional']);
    Project::factory()->create(); // another tenant
    $user = ClientMembership::factory()->create(['client_id' => $mine->client_id])->profile->user;
    DB::table('projects')->where('id', $mine->id)->update(['created_at' => now()->subDay()]);
    DB::table('projects')->where('id', $newer->id)->update(['created_at' => now()]);
    plSignIn($user);

    $this->getJson('/api/projects')->assertOk()->assertExactJson(['projects' => [
        ['id' => $newer->id, 'status' => 'CONCEPTS_READY', 'packageCode' => 'professional'],
        ['id' => $mine->id, 'status' => 'AWAITING_BRIEF', 'packageCode' => 'essential'],
    ]]);
});

it('returns an empty list for a user with no memberships', function () {
    Project::factory()->create();
    plSignIn(User::factory()->create());

    $this->getJson('/api/projects')->assertOk()->assertExactJson(['projects' => []]);
});

<?php

use App\Models\ClientMembership;
use App\Models\Profile;
use App\Models\Project;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\Support\SessionRows;
use Tests\Support\TruncatesDatabaseAsOwner;

uses(TruncatesDatabaseAsOwner::class);

// Story 6.1 (C-01, DV-UX): /dashboard is the list, except one project (straight to it).
const DB_SID = 'dbdefghijabcdefghijabcdefghijabcdefghij1';

beforeEach(fn () => config(['session.driver' => 'database']));

function dbSignIn(User $user): void
{
    SessionRows::insert(DB_SID, $user->id, time(), time(), true);
    test()->withCredentials()->withCookie(config('session.cookie'), DB_SID);
}

it('sends a customer with exactly one project to its Overview', function () {
    $project = Project::factory()->create();
    dbSignIn(ClientMembership::factory()->create(['client_id' => $project->client_id])->profile->user);

    $this->get('/dashboard')->assertRedirect("/project/{$project->id}");
});

it('lists two projects newest first with status and new flags', function () {
    $a = Project::factory()->create(['status' => 'CONCEPTS_READY', 'package_code' => 'professional']);
    $b = Project::factory()->create(['client_id' => $a->client_id, 'status' => 'IN_DESIGN', 'package_code' => 'essential']);
    DB::table('projects')->where('id', $a->id)->update(['created_at' => now()->subDay()]);
    dbSignIn(ClientMembership::factory()->create(['client_id' => $a->client_id])->profile->user);

    $this->get('/dashboard')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('Dashboard')
        ->has('projects', 2)
        ->where('projects.0.id', $b->id)
        ->where('projects.0.status', 'IN_DESIGN')
        ->where('projects.1.id', $a->id)
        ->where('projects.1.hasNewConcepts', false)
        ->has('projects.1.hasNewMessages'));
});

it('shows the empty list for a user with no projects', function () {
    dbSignIn(ClientMembership::factory()->create()->profile->user);

    $this->get('/dashboard')->assertOk()->assertInertia(fn (Assert $page) => $page->component('Dashboard')->has('projects', 0));
});

// Next sends an admin from /dashboard to /admin; that page is Epic 7, so until then the admin sees the (empty) list.
it('keeps an admin on the list until the admin workspace exists', function () {
    dbSignIn(Profile::factory()->admin()->create()->user);

    $this->get('/dashboard')->assertOk()->assertInertia(fn (Assert $page) => $page->component('Dashboard')->has('projects', 0));
});

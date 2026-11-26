<?php

use App\Models\ClientMembership;
use App\Models\Profile;
use App\Models\Project;
use Illuminate\Support\Facades\DB;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\Support\SessionRows;
use Tests\Support\TruncatesDatabaseAsOwner;

uses(TruncatesDatabaseAsOwner::class);

// Story 6.2b (C-03): /project/{id} is behind sign-in; it carries the snapshot and 404s for a project the visitor cannot see.

beforeEach(function () {
    config(['session.driver' => 'database']);
});

afterEach(fn () => DB::disconnect());

function ovSignIn($user): void
{
    $sid = substr(hash('sha256', $user->id.microtime()), 0, 40);
    SessionRows::insert($sid, $user->id, time(), time(), true);
    test()->flushSession();
    test()->withCredentials()->withCookie(config('session.cookie'), $sid);
}

it('sends a signed-out visitor away from a project page', function () {
    $this->get('/project/00000000-0000-4000-8000-000000000000')->assertRedirect();
});

it('has a named route for the Overview page', function () {
    expect(route('project.overview', ['id' => 'x'], false))->toBe('/project/x');
});

it('renders the Overview with the snapshot for a member', function () {
    $project = Project::factory()->create(['status' => 'CONCEPTS_READY']);
    $user = ClientMembership::factory()->create(['client_id' => $project->client_id, 'role' => 'owner'])->profile->user;
    ovSignIn($user);

    $this->get("/project/{$project->id}")->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('Project/Overview')
        ->where('projectId', $project->id)
        ->where('snapshot.status', 'CONCEPTS_READY')
        ->has('snapshot.timeline')
        ->has('snapshot.entitlementUsage.revisions')
        ->where('user.email', $user->email));
});

it('answers 404 for a project the visitor is not a member of, and for a malformed id', function () {
    $project = Project::factory()->create();
    $other = ClientMembership::factory()->create()->profile->user;
    ovSignIn($other);

    $this->get("/project/{$project->id}")->assertNotFound();
    $this->get('/project/not-a-uuid')->assertNotFound();
});

it('answers 404 for a well-formed id that matches no project', function () {
    ovSignIn(ClientMembership::factory()->create()->profile->user);

    $this->get('/project/00000000-0000-4000-8000-0000000000ff')->assertNotFound();
});

// Story 6.1 (DV-UX, D-02): an admin on a customer project URL goes to the admin workspace for it.
it('redirects an admin to /admin/projects/{id}', function () {
    $project = Project::factory()->create(['status' => 'CONCEPTS_READY']);
    $admin = Profile::factory()->admin()->create()->user;
    ovSignIn($admin);

    $this->get("/project/{$project->id}")->assertRedirect("/admin/projects/{$project->id}");
});

it('serves the dev fixture page with the requested status', function () {
    $this->get('/dev/project-overview?status=ON_HOLD&revisions=0')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('Project/Overview')
        ->where('snapshot.status', 'ON_HOLD')
        ->where('snapshot.entitlementUsage.revisions.remaining', 0));
});

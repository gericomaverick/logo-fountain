<?php

use App\Models\ClientMembership;
use App\Models\Concept;
use App\Models\Profile;
use App\Models\Project;
use Illuminate\Support\Facades\DB;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\Support\SessionRows;
use Tests\Support\TruncatesDatabaseAsOwner;

uses(TruncatesDatabaseAsOwner::class);

// Story 6.7 UI half (C-08, C-09, DV-7): the gallery and viewer pages are behind sign-in, carry the snapshot (tab dots), and 404 for what the visitor cannot see.

beforeEach(function () {
    config(['session.driver' => 'database']);
});

afterEach(fn () => DB::disconnect());

function cgSignIn($user): void
{
    $sid = substr(hash('sha256', $user->id.microtime()), 0, 40);
    SessionRows::insert($sid, $user->id, time(), time(), true);
    test()->flushSession();
    test()->withCredentials()->withCookie(config('session.cookie'), $sid);
}

it('has named routes for the gallery and the viewer', function () {
    expect(route('project.concepts', ['id' => 'x'], false))->toBe('/project/x/concepts');
    expect(route('project.concept', ['id' => 'x', 'conceptId' => 'y'], false))->toBe('/project/x/concept/y');
});

it('sends a signed-out visitor away from both pages', function () {
    $this->get('/project/00000000-0000-4000-8000-000000000000/concepts')->assertRedirect();
    $this->get('/project/00000000-0000-4000-8000-000000000000/concept/00000000-0000-4000-8000-000000000001')->assertRedirect();
});

it('renders the gallery with the new-concepts flag', function () {
    $project = Project::factory()->create(['status' => 'CONCEPTS_READY']);
    Concept::factory()->status('published')->create(['project_id' => $project->id, 'number' => 1]);
    $user = ClientMembership::factory()->create(['client_id' => $project->client_id, 'role' => 'owner'])->profile->user;
    cgSignIn($user);

    $this->get("/project/{$project->id}/concepts")->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('Project/Concepts')
        ->where('projectId', $project->id)
        ->where('snapshot.hasNewConcepts', true));
});

it('renders the viewer for a published concept, with no storage path in the props', function () {
    $project = Project::factory()->create(['status' => 'CONCEPTS_READY']);
    $concept = Concept::factory()->status('published')->create(['project_id' => $project->id, 'number' => 2]);
    $user = ClientMembership::factory()->create(['client_id' => $project->client_id, 'role' => 'owner'])->profile->user;
    cgSignIn($user);

    $this->get("/project/{$project->id}/concept/{$concept->id}")->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('Project/Concept')
        ->where('concept.id', $concept->id)
        ->where('concept.number', 2)
        ->missing('concept.path'));
});

it('answers 404 for a draft concept, an unknown one, a malformed id, and another project', function () {
    $project = Project::factory()->create();
    $draft = Concept::factory()->status('draft')->create(['project_id' => $project->id]);
    $user = ClientMembership::factory()->create(['client_id' => $project->client_id, 'role' => 'owner'])->profile->user;
    cgSignIn($user);

    $this->get("/project/{$project->id}/concept/{$draft->id}")->assertNotFound();
    $this->get("/project/{$project->id}/concept/00000000-0000-4000-8000-0000000000ff")->assertNotFound();
    $this->get("/project/{$project->id}/concept/nope")->assertNotFound();

    $other = Project::factory()->create();
    $this->get("/project/{$other->id}/concepts")->assertNotFound();
});

it('redirects an admin to the admin workspace', function () {
    $project = Project::factory()->create();
    cgSignIn(Profile::factory()->admin()->create()->user);

    $this->get("/project/{$project->id}/concepts")->assertRedirect("/admin/projects/{$project->id}");
});

it('serves the dev fixtures with the tab dot on request', function () {
    $this->get('/dev/project-concepts?new=1')->assertOk()->assertInertia(fn (Assert $page) => $page->component('Project/Concepts')->where('snapshot.hasNewConcepts', true));
    $this->get('/dev/project-concept?status=approved')->assertOk()->assertInertia(fn (Assert $page) => $page->component('Project/Concept')->where('concept.status', 'approved'));
});

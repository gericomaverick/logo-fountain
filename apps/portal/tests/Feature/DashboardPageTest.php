<?php

use App\Domain\ProjectStatus;
use App\Models\ClientMembership;
use App\Models\Concept;
use App\Models\Message;
use App\Models\MessageThread;
use App\Models\Profile;
use App\Models\Project;
use App\Models\ProjectReadState;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
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

function dbProjects(TestResponse $response): array
{
    $rows = [];
    $response->assertInertia(function (Assert $page) use (&$rows) {
        $rows = $page->toArray()['props']['projects'];
    });

    return $rows;
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

it('lists only the projects of the user\'s own clients', function () {
    $mine = Project::factory()->create();
    Project::factory()->create(['client_id' => $mine->client_id]);
    $theirs = Project::factory()->create();
    dbSignIn(ClientMembership::factory()->create(['client_id' => $mine->client_id])->profile->user);

    $this->get('/dashboard')->assertOk()->assertInertia(fn (Assert $page) => $page
        ->has('projects', 2)
        ->where('projects', fn ($rows) => collect($rows)->pluck('id')->doesntContain($theirs->id)));
});

it('flags new concepts and new messages, and clears them when read', function () {
    $a = Project::factory()->create();
    $b = Project::factory()->create(['client_id' => $a->client_id]);
    $member = ClientMembership::factory()->create(['client_id' => $a->client_id])->profile;
    dbSignIn($member->user);
    Concept::factory()->for($a)->status(Concept::STATUS_PUBLISHED)->create();
    Concept::factory()->for($b)->status(Concept::STATUS_DRAFT)->create(); // a draft is not visible, so not new
    $thread = MessageThread::query()->create(['project_id' => $a->id]);
    $send = fn (string $kind) => Message::query()->forceCreate(['thread_id' => $thread->id, 'project_id' => $a->id,
        'sender_id' => $member->id, 'body' => 'hi', 'kind' => $kind]);
    $send('system');

    $flags = fn () => collect(dbProjects($this->get('/dashboard')->assertOk()))->keyBy('id');
    expect($flags()[$a->id])->toMatchArray(['hasNewConcepts' => true, 'hasNewMessages' => false])
        ->and($flags()[$b->id])->toMatchArray(['hasNewConcepts' => false, 'hasNewMessages' => false]);

    $send('text');
    expect($flags()[$a->id]['hasNewMessages'])->toBeTrue();

    ProjectReadState::query()->create(['user_id' => $member->id, 'project_id' => $a->id,
        'last_seen_messages_at' => now()->addMinute(), 'last_seen_concepts_at' => now()->addMinute()]);
    expect($flags()[$a->id])->toMatchArray(['hasNewConcepts' => false, 'hasNewMessages' => false]);
});

it('derives the displayed status like the snapshot (approved concept, final files)', function () {
    $a = Project::factory()->create(['status' => 'CONCEPTS_READY']);
    $b = Project::factory()->create(['client_id' => $a->client_id, 'status' => 'IN_DESIGN']);
    Concept::factory()->for($a)->status(Concept::STATUS_APPROVED)->create();
    dbSignIn(ClientMembership::factory()->create(['client_id' => $a->client_id])->profile->user);

    $rows = collect(dbProjects($this->get('/dashboard')->assertOk()))->keyBy('id');
    expect($rows[$a->id]['status'])->toBe(ProjectStatus::display('CONCEPTS_READY', true, false))
        ->and($rows[$b->id]['status'])->toBe('IN_DESIGN');
});

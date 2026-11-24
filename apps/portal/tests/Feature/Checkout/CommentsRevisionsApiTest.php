<?php

use App\Models\ClientMembership;
use App\Models\Concept;
use App\Models\Profile;
use App\Models\Project;
use App\Models\ProjectEntitlement;
use Illuminate\Support\Facades\DB;
use Tests\Support\MailFixtures;
use Tests\Support\SessionRows;
use Tests\Support\TruncatesDatabaseAsOwner;

uses(TruncatesDatabaseAsOwner::class);

// Story 6.8 (C-10, C-11, DV-7, DV-14): concept comments and revision requests. Compared with the Next routes
// `concepts/[conceptId]/comments/route.ts`, `revision-requests/route.ts` and `revision-requests/route.test.ts`.

beforeEach(function () {
    config(['session.driver' => 'database', 'queue.default' => 'database', 'mail.default' => 'array', 'mail.from.address' => 'from@example.test',
        'portal.public_site_url' => 'https://portal.example.test', 'portal.admin_notification_emails' => 'ops@example.test']);
    test()->withHeaders(['Origin' => 'https://portal.example.test']);
});

afterEach(fn () => DB::disconnect());

function crSignIn($user): void
{
    $sid = substr(hash('sha256', $user->id.microtime()), 0, 40);
    SessionRows::insert($sid, $user->id, time(), time(), true);
    test()->flushSession();
    test()->withCredentials()->withCookie(config('session.cookie'), $sid);
}

function crMember(Project $project)
{
    return ClientMembership::factory()->create(['client_id' => $project->client_id, 'role' => 'owner'])->profile->user;
}

function crProject(string $status = 'CONCEPTS_READY', int $limit = 2): Project
{
    $project = Project::factory()->create(['status' => $status]);
    ProjectEntitlement::create(['project_id' => $project->id, 'key' => 'revisions', 'limit_int' => $limit, 'consumed_int' => 0, 'reserved_int' => 0]);

    return $project;
}

function crPublished(Project $project, string $status = 'published'): Concept
{
    return Concept::factory()->status($status)->create(['project_id' => $project->id]);
}

// ---- C-10 comments

it('lists and posts comments: trimmed, ascending, per concept, author with isAdmin, no system message, no email', function () {
    $project = crProject();
    $one = crPublished($project);
    $two = crPublished($project);
    $user = crMember($project);
    crSignIn($user);
    $path = "/api/projects/{$project->id}/concepts/{$one->id}/comments";
    $this->getJson($path)->assertOk()->assertExactJson(['comments' => []]);
    $first = $this->postJson($path, ['body' => '  Love the icon  '])->assertCreated()->json();
    $this->postJson($path, ['body' => 'Maybe bolder?'])->assertCreated();
    expect($first)->toHaveKeys(['ok', 'comment'])
        ->and($first['comment']['body'])->toBe('Love the icon')
        ->and(array_keys($first['comment']['author']))->toBe(['id', 'email', 'fullName', 'isAdmin'])
        ->and($first['comment']['author']['isAdmin'])->toBeFalse()
        ->and($first['comment']['author']['email'])->toBe($user->profile->email);
    $list = $this->getJson($path)->json('comments');
    expect(array_column($list, 'body'))->toBe(['Love the icon', 'Maybe bolder?']);
    $this->getJson("/api/projects/{$project->id}/concepts/{$two->id}/comments")->assertExactJson(['comments' => []]);
    expect(DB::table('messages')->count())->toBe(0)->and(MailFixtures::jobs())->toBe(0);
});

it('validates the comment body: 1-2000 chars after trimming', function (mixed $data) {
    $project = crProject();
    $concept = crPublished($project);
    crSignIn(crMember($project));
    $res = $this->postJson("/api/projects/{$project->id}/concepts/{$concept->id}/comments", $data)->assertStatus(400);
    expect($res->json('error.code'))->toBe('INVALID_COMMENT_BODY');
})->with([[[]], [['body' => '']], [['body' => '   ']], [['body' => 42]], [['body' => str_repeat('x', 2001)]]]);

it('accepts exactly 2000 characters once trimmed', function () {
    $project = crProject();
    $concept = crPublished($project);
    crSignIn(crMember($project));
    $this->postJson("/api/projects/{$project->id}/concepts/{$concept->id}/comments", ['body' => ' '.str_repeat('x', 2000).' '])->assertCreated();
});

it('lets an admin read and reply, never 500 (DV-14), and never writes the admin flag', function () {
    $project = crProject();
    $concept = crPublished($project);
    $admin = Profile::factory()->admin()->create();
    crSignIn($admin->user);
    $path = "/api/projects/{$project->id}/concepts/{$concept->id}/comments";
    $res = $this->postJson($path, ['body' => 'Designer reply'])->assertCreated();
    expect($res->json('comment.author.isAdmin'))->toBeTrue();
    crSignIn(crMember($project));
    expect($this->getJson($path)->json('comments.0.author.isAdmin'))->toBeTrue();
    expect(Profile::query()->where('is_admin', true)->count())->toBe(1);
});

it('guards comments: 401 anonymous, 404 for a non-member and for a non-uuid project', function () {
    $project = crProject();
    $concept = crPublished($project);
    $path = "/api/projects/{$project->id}/concepts/{$concept->id}/comments";
    $this->getJson($path)->assertStatus(401);
    $this->postJson($path, ['body' => 'x'])->assertStatus(401);
    crSignIn(crMember(crProject()));
    foreach ([$this->getJson($path), $this->postJson($path, ['body' => 'x']), $this->getJson("/api/projects/nope/concepts/{$concept->id}/comments")] as $res) {
        $res->assertStatus(404);
        expect($res->json('error.code'))->toBe('PROJECT_NOT_FOUND');
    }
    expect(DB::table('concept_comments')->count())->toBe(0);
});

it('answers a draft, deleted, archived, foreign or unknown concept identically (DV-7, IDOR)', function (string $status) {
    $project = crProject();
    $hidden = crPublished($project, $status);
    $foreign = crPublished(crProject());
    crSignIn(crMember($project));
    $unknown = $this->getJson("/api/projects/{$project->id}/concepts/".fake()->uuid().'/comments');
    $unknown->assertStatus(404);
    foreach ([$hidden, $foreign] as $c) {
        $get = $this->getJson("/api/projects/{$project->id}/concepts/{$c->id}/comments");
        $post = $this->postJson("/api/projects/{$project->id}/concepts/{$c->id}/comments", ['body' => 'x']);
        expect($get->getContent())->toBe($unknown->getContent())->and($post->getContent())->toBe($unknown->getContent())
            ->and($unknown->json('error.code'))->toBe('CONCEPT_NOT_FOUND');
    }
    expect(DB::table('concept_comments')->count())->toBe(0);
})->with(['draft', 'deleted', 'archived']);

// ---- C-11 revision requests

it('reserves one revision, moves to REVISIONS_IN_PROGRESS, writes the system message and queues one admin email', function () {
    $project = crProject();
    $concept = crPublished($project);
    $user = crMember($project);
    crSignIn($user);
    $res = $this->postJson("/api/projects/{$project->id}/revision-requests", ['body' => '  Bolder please  ', 'conceptId' => $concept->id])->assertCreated()->json();
    expect(array_keys($res))->toBe(['ok', 'revisionRequest', 'project'])
        ->and(array_keys($res['revisionRequest']))->toBe(['id', 'projectId', 'conceptId', 'status', 'body', 'createdAt'])
        ->and($res['revisionRequest'])->toMatchArray(['projectId' => $project->id, 'conceptId' => $concept->id, 'status' => 'requested', 'body' => 'Bolder please'])
        ->and($res['revisionRequest']['createdAt'])->toMatch('/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/')
        ->and($res['project'])->toBe(['id' => $project->id, 'status' => 'REVISIONS_IN_PROGRESS']);
    $this->getJson("/api/projects/{$project->id}/entitlements")->assertExactJson(['entitlements' => ['concepts' => 0, 'revisions' => 1]]);
    expect(DB::table('projects')->where('id', $project->id)->value('status'))->toBe('REVISIONS_IN_PROGRESS')
        ->and(DB::table('messages')->where('kind', 'system')->value('body'))->toBe('Revision request received ('.substr($res['revisionRequest']['id'], 0, 8).').')
        ->and(DB::table('audit_events')->where('type', 'revision_requested')->count())->toBe(1)
        ->and(DB::table('audit_events')->where('type', 'state_changed')->count())->toBe(1)
        ->and(DB::table('audit_events')->where('type', 'email_sent:admin_feedback_on_concept:'.$res['revisionRequest']['id'])->count())->toBe(1)
        ->and(MailFixtures::jobs())->toBe(1);
});

it('allows a further request while already in REVISIONS_IN_PROGRESS, then 400 NO_REVISIONS_REMAINING', function () {
    $project = crProject('REVISIONS_IN_PROGRESS');
    $concept = crPublished($project);
    crSignIn(crMember($project));
    $path = "/api/projects/{$project->id}/revision-requests";
    $this->postJson($path, ['body' => 'a', 'conceptId' => $concept->id])->assertCreated()->assertJsonPath('project.status', 'REVISIONS_IN_PROGRESS');
    $this->postJson($path, ['body' => 'b', 'conceptId' => $concept->id])->assertCreated();
    $none = $this->postJson($path, ['body' => 'c', 'conceptId' => $concept->id])->assertStatus(400);
    expect($none->json('error.code'))->toBe('NO_REVISIONS_REMAINING')->and($none->json('error.details'))->toBe(['nextStep' => 'Buy a revision add-on to continue.'])
        ->and(DB::table('revision_requests')->count())->toBe(2)
        ->and((int) DB::table('project_entitlements')->value('reserved_int'))->toBe(2)
        ->and(MailFixtures::jobs())->toBe(2)
        ->and(DB::table('audit_events')->where('type', 'state_changed')->count())->toBe(0);
});

it('refuses with no entitlement row, and leaves the status alone', function () {
    $project = Project::factory()->create(['status' => 'CONCEPTS_READY']);
    $concept = crPublished($project);
    crSignIn(crMember($project));
    $this->postJson("/api/projects/{$project->id}/revision-requests", ['body' => 'x', 'conceptId' => $concept->id])->assertStatus(400)->assertJsonPath('error.code', 'NO_REVISIONS_REMAINING');
    expect(DB::table('projects')->where('id', $project->id)->value('status'))->toBe('CONCEPTS_READY')->and(DB::table('revision_requests')->count())->toBe(0);
});

it('refuses a project that cannot enter revisions with details.allowed', function () {
    $project = crProject('AWAITING_APPROVAL');
    $concept = crPublished($project);
    crSignIn(crMember($project));
    $res = $this->postJson("/api/projects/{$project->id}/revision-requests", ['body' => 'x', 'conceptId' => $concept->id])->assertStatus(400);
    expect($res->json('error.code'))->toBe('INVALID_PROJECT_STATUS_TRANSITION')
        ->and($res->json('error.details.allowed'))->toBe(['FINAL_FILES_READY', 'ON_HOLD', 'CANCELLED', 'REFUNDED'])
        ->and(DB::table('revision_requests')->count())->toBe(0)->and((int) DB::table('project_entitlements')->value('reserved_int'))->toBe(0);
});

it('validates the body and conceptId (400 INVALID_BODY), 5000 chars allowed', function () {
    $project = crProject();
    $concept = crPublished($project);
    crSignIn(crMember($project));
    $path = "/api/projects/{$project->id}/revision-requests";
    foreach ([[], ['body' => 'x'], ['conceptId' => $concept->id], ['body' => '   ', 'conceptId' => $concept->id], ['body' => str_repeat('x', 5001), 'conceptId' => $concept->id], ['body' => 'x', 'conceptId' => '  ']] as $data) {
        $this->postJson($path, $data)->assertStatus(400)->assertJsonPath('error.code', 'INVALID_BODY');
    }
    $this->postJson($path, ['body' => str_repeat('y', 5000), 'conceptId' => $concept->id])->assertCreated();
});

it('answers a hidden, approved, foreign or unknown concept with one 400 CONCEPT_NOT_FOUND and reserves nothing (DV-7)', function (string $status) {
    $project = crProject();
    $hidden = crPublished($project, $status);
    $foreign = crPublished(crProject());
    crSignIn(crMember($project));
    $path = "/api/projects/{$project->id}/revision-requests";
    $unknown = $this->postJson($path, ['body' => 'x', 'conceptId' => fake()->uuid()])->assertStatus(400);
    expect($unknown->json('error.code'))->toBe('CONCEPT_NOT_FOUND');
    foreach ([$hidden->id, $foreign->id, 'not-a-uuid'] as $id) {
        expect($this->postJson($path, ['body' => 'x', 'conceptId' => $id])->getContent())->toBe($unknown->getContent());
    }
    expect((int) DB::table('project_entitlements')->where('project_id', $project->id)->value('reserved_int'))->toBe(0)
        ->and(DB::table('projects')->where('id', $project->id)->value('status'))->toBe('CONCEPTS_READY')->and(MailFixtures::jobs())->toBe(0);
})->with(['draft', 'deleted', 'archived', 'approved']);

it('guards revision requests: 401 anonymous, 404 for a non-member and for an admin', function () {
    $project = crProject();
    $concept = crPublished($project);
    $path = "/api/projects/{$project->id}/revision-requests";
    $data = ['body' => 'x', 'conceptId' => $concept->id];
    $this->postJson($path, $data)->assertStatus(401);
    foreach ([crMember(crProject()), Profile::factory()->admin()->create()->user] as $who) {
        crSignIn($who);
        $this->postJson($path, $data)->assertStatus(404)->assertJsonPath('error.code', 'PROJECT_NOT_FOUND');
    }
    expect(DB::table('revision_requests')->count())->toBe(0);
});

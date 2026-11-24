<?php

use App\Models\ClientMembership;
use App\Models\Concept;
use App\Models\Profile;
use App\Models\Project;
use Illuminate\Support\Facades\DB;
use Tests\Support\MailFixtures;
use Tests\Support\SessionRows;
use Tests\Support\TruncatesDatabaseAsOwner;

uses(TruncatesDatabaseAsOwner::class);

// Story 6.9 (C-12, N-07, N-08, DV-7): approve a published concept. Compared with the Next route
// `api/projects/[id]/approve/route.ts` and its `route.test.ts` (both emails sent with the project and concept id;
// 200 `{ok, concept, project}`); the Next test mocks everything, so the status, archive and audit checks are ours.

beforeEach(function () {
    config(['session.driver' => 'database', 'queue.default' => 'database', 'mail.default' => 'array', 'mail.from.address' => 'from@example.test',
        'portal.public_site_url' => 'https://portal.example.test', 'portal.admin_notification_emails' => 'ops@example.test']);
    test()->withHeaders(['Origin' => 'https://portal.example.test']);
});

afterEach(fn () => DB::disconnect());

function apSignIn($user): void
{
    $sid = substr(hash('sha256', $user->id.microtime()), 0, 40);
    SessionRows::insert($sid, $user->id, time(), time(), true);
    test()->flushSession();
    test()->withCredentials()->withCookie(config('session.cookie'), $sid);
}

function apMember(Project $project)
{
    return ClientMembership::factory()->create(['client_id' => $project->client_id, 'role' => 'owner'])->profile->user;
}

function apConcept(Project $project, string $status = 'published'): Concept
{
    return Concept::factory()->status($status)->create(['project_id' => $project->id]);
}

it('approves: others archived, approved, AWAITING_APPROVAL, both audits, each email once', function () {
    $project = Project::factory()->create(['status' => 'CONCEPTS_READY']);
    $pick = apConcept($project);
    $other = apConcept($project);
    $earlier = apConcept($project, 'approved');
    $draft = apConcept($project, 'draft');
    $deleted = apConcept($project, 'deleted');
    $user = apMember($project);
    apSignIn($user);
    $res = $this->postJson("/api/projects/{$project->id}/approve", ['conceptId' => "  {$pick->id} "])->assertOk()->json();
    expect(array_keys($res))->toBe(['ok', 'concept', 'project'])
        ->and($res['concept'])->toBe(['id' => $pick->id, 'number' => (int) $pick->number, 'status' => 'approved'])
        ->and($res['project'])->toBe(['id' => $project->id, 'status' => 'AWAITING_APPROVAL']);
    $status = fn (Concept $c) => DB::table('concepts')->where('id', $c->id)->value('status');
    expect($status($pick))->toBe('approved')->and($status($other))->toBe('archived')->and($status($earlier))->toBe('archived')
        ->and($status($draft))->toBe('draft')->and($status($deleted))->toBe('deleted')
        ->and(DB::table('projects')->where('id', $project->id)->value('status'))->toBe('AWAITING_APPROVAL')
        ->and(DB::table('audit_events')->where('type', 'concept_approved')->count())->toBe(1)
        ->and(DB::table('audit_events')->where('type', 'state_changed')->count())->toBe(1)
        ->and(DB::table('audit_events')->where('type', 'email_sent:client_concept_approved:'.$pick->id)->count())->toBe(1)
        ->and(DB::table('audit_events')->where('type', 'email_sent:admin_concept_approved:'.$pick->id)->count())->toBe(1)
        ->and(MailFixtures::jobs())->toBe(2);
    $audit = DB::table('audit_events')->where('type', 'concept_approved')->first();
    expect(json_decode($audit->payload, true))->toBe(['conceptId' => $pick->id, 'conceptNumber' => (int) $pick->number]);
});

it('a second approval is a 400 transition error and sends nothing more', function () {
    $project = Project::factory()->create(['status' => 'CONCEPTS_READY']);
    $pick = apConcept($project);
    apSignIn(apMember($project));
    $this->postJson("/api/projects/{$project->id}/approve", ['conceptId' => $pick->id])->assertOk();
    $again = $this->postJson("/api/projects/{$project->id}/approve", ['conceptId' => $pick->id])->assertStatus(404);
    expect($again->json('error.code'))->toBe('CONCEPT_NOT_FOUND')->and(MailFixtures::jobs())->toBe(2);
    $late = apConcept($project);
    $r = $this->postJson("/api/projects/{$project->id}/approve", ['conceptId' => $late->id])->assertStatus(400);
    expect($r->json('error.code'))->toBe('INVALID_PROJECT_STATUS_TRANSITION')->and(DB::table('concepts')->where('id', $late->id)->value('status'))->toBe('published')
        ->and(MailFixtures::jobs())->toBe(2);
});

it('refuses a project not in a state that allows approval, changing nothing', function () {
    $project = Project::factory()->create(['status' => 'AWAITING_BRIEF']);
    $pick = apConcept($project);
    apSignIn(apMember($project));
    $r = $this->postJson("/api/projects/{$project->id}/approve", ['conceptId' => $pick->id])->assertStatus(400);
    expect($r->json('error.code'))->toBe('INVALID_PROJECT_STATUS_TRANSITION')->and($r->json('error.message'))->toBe('Invalid transition from AWAITING_BRIEF to AWAITING_APPROVAL')
        ->and(DB::table('concepts')->where('id', $pick->id)->value('status'))->toBe('published')
        ->and(DB::table('audit_events')->count())->toBe(0)->and(MailFixtures::jobs())->toBe(0);
});

it('DV-7: draft, deleted, archived, approved, foreign, non-uuid and unknown concepts are byte-identical 404s', function () {
    $project = Project::factory()->create(['status' => 'CONCEPTS_READY']);
    $foreign = apConcept(Project::factory()->create());
    apSignIn(apMember($project));
    $path = "/api/projects/{$project->id}/approve";
    $unknown = $this->postJson($path, ['conceptId' => '11111111-1111-4111-8111-111111111111'])->assertStatus(404);
    $expected = $unknown->getContent();
    expect($unknown->json('error.code'))->toBe('CONCEPT_NOT_FOUND');
    foreach (['draft', 'deleted', 'archived', 'approved'] as $status) {
        $c = apConcept($project, $status);
        expect($this->postJson($path, ['conceptId' => $c->id])->assertStatus(404)->getContent())->toBe($expected);
    }
    expect($this->postJson($path, ['conceptId' => $foreign->id])->getContent())->toBe($expected)
        ->and($this->postJson($path, ['conceptId' => 'nope'])->getContent())->toBe($expected)
        ->and(DB::table('projects')->where('id', $project->id)->value('status'))->toBe('CONCEPTS_READY')
        ->and(DB::table('audit_events')->count())->toBe(0)->and(MailFixtures::jobs())->toBe(0);
});

it('validates the body: conceptId required, 400 INVALID_CONCEPT_ID', function (mixed $data) {
    $project = Project::factory()->create(['status' => 'CONCEPTS_READY']);
    apSignIn(apMember($project));
    $r = $this->postJson("/api/projects/{$project->id}/approve", $data)->assertStatus(400);
    expect($r->json('error.code'))->toBe('INVALID_CONCEPT_ID')->and($r->json('error.details'))->toBe(['nextStep' => 'Provide a valid conceptId in the request body.']);
})->with([[[]], [['conceptId' => '   ']], [['conceptId' => 5]], [['conceptId' => null]]]);

it('guards: 401 anonymous, 404 non-member, non-uuid project, unknown project, and admin; foreign origin refused', function () {
    $project = Project::factory()->create(['status' => 'CONCEPTS_READY']);
    $pick = apConcept($project);
    $body = ['conceptId' => $pick->id];
    $this->postJson("/api/projects/{$project->id}/approve", $body)->assertStatus(401);
    $stranger = apMember(Project::factory()->create());
    apSignIn($stranger);
    foreach ([$project->id, 'not-a-uuid', '11111111-1111-4111-8111-111111111111'] as $id) {
        $r = $this->postJson("/api/projects/{$id}/approve", $body)->assertStatus(404);
        expect($r->json('error.code'))->toBe('PROJECT_NOT_FOUND');
    }
    apSignIn(Profile::factory()->admin()->create()->user);
    expect($this->postJson("/api/projects/{$project->id}/approve", $body)->assertStatus(404)->json('error.code'))->toBe('PROJECT_NOT_FOUND');
    apSignIn(apMember($project));
    $this->withHeaders(['Origin' => 'https://evil.example'])->postJson("/api/projects/{$project->id}/approve", $body)->assertStatus(403);
    expect(DB::table('concepts')->where('id', $pick->id)->value('status'))->toBe('published')->and(MailFixtures::jobs())->toBe(0);
});

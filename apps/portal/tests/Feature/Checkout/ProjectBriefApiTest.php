<?php

use App\Models\ClientMembership;
use App\Models\Message;
use App\Models\MessageThread;
use App\Models\Profile;
use App\Models\Project;
use App\Models\ProjectBrief;
use App\Models\ProjectBriefDraft;
use App\Support\Audit;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Tests\Support\SessionRows;
use Tests\Support\TruncatesDatabaseAsOwner;

uses(TruncatesDatabaseAsOwner::class);

// Stories 6.5 and 6.6 (C-05 API half, C-06, C-07): brief draft and brief routes.
const PB_SID = 'pbdefghijabcdefghijabcdefghijabcdefghij1';
const PB_ORIGIN = 'https://app.example.com';

beforeEach(fn () => config(['session.driver' => 'database', 'portal.public_site_url' => PB_ORIGIN]));

function pbSignIn($user): void
{
    SessionRows::insert(PB_SID, $user->id, time(), time(), true);
    test()->withCredentials()->withCookie(config('session.cookie'), PB_SID)->withHeaders(['Origin' => PB_ORIGIN]);
}

function pbMember(Project $project)
{
    return ClientMembership::factory()->create(['client_id' => $project->client_id, 'role' => 'owner'])->profile->user;
}

function pbAnswers(array $over = []): array
{
    return array_merge([
        'brandName' => 'Acme', 'industry' => 'Coffee', 'offerSummary' => 'Beans', 'audiencePrimary' => 'Locals', 'businessGoals' => 'Grow',
        'brandPersonality' => 'Warm', 'styleDirection' => 'Simple', 'usageContexts' => 'Cups',
    ], $over);
}

it('rejects anonymous and non-member callers on every route, as 401 and 404', function () {
    $project = Project::factory()->create();
    $this->withHeaders(['Origin' => PB_ORIGIN]);
    foreach ([['getJson', 'brief'], ['postJson', 'brief'], ['getJson', 'brief/draft'], ['putJson', 'brief/draft'], ['deleteJson', 'brief/draft']] as [$m, $path]) {
        $this->{$m}("/api/projects/{$project->id}/{$path}", [])->assertStatus(401);
    }
    pbSignIn(ClientMembership::factory()->create()->profile->user);
    foreach ([['getJson', 'brief'], ['postJson', 'brief'], ['getJson', 'brief/draft'], ['putJson', 'brief/draft'], ['deleteJson', 'brief/draft']] as [$m, $path]) {
        $r = $this->{$m}("/api/projects/{$project->id}/{$path}", ['answers' => pbAnswers(), ...pbAnswers()]);
        $r->assertStatus(404);
        expect($r->getContent())->toContain('PROJECT_NOT_FOUND');
    }
    $this->getJson('/api/projects/nope/brief/draft')->assertStatus(404);
    expect(DB::table('project_brief_drafts')->count())->toBe(0)->and(DB::table('project_briefs')->count())->toBe(0);
});

it('saves, reads, overwrites and discards a draft; an unknown key is dropped and empty answers are kept', function () {
    $project = Project::factory()->create();
    pbSignIn(pbMember($project));
    $url = "/api/projects/{$project->id}/brief/draft";
    $this->getJson($url)->assertOk()->assertExactJson(['draft' => null]);
    $this->putJson($url, ['answers' => ['brandName' => '  Acme  ', 'evil' => 'x', 'description' => 'old shape']])->assertOk()->assertJsonPath('ok', true);
    $d = $this->getJson($url)->assertOk()->json('draft');
    expect($d['answers']['brandName'])->toBe('Acme')->and($d['answers']['offerSummary'])->toBe('old shape')->and($d['answers'])->not->toHaveKey('evil')
        ->and($d['answers'])->toHaveCount(16)->and($d['updatedAt'])->toMatch('/^\d{4}-\d\d-\d\dT[\d:]+\.\d{3}Z$/');
    $this->putJson($url, ['answers' => ['brandName' => "Two\nlines  inside"]])->assertOk();
    expect(DB::table('project_brief_drafts')->count())->toBe(1)
        ->and($this->getJson($url)->json('draft.answers.brandName'))->toBe("Two\nlines  inside");
    $this->deleteJson($url)->assertOk()->assertExactJson(['ok' => true]);
    $this->deleteJson($url)->assertOk();
    $this->getJson($url)->assertExactJson(['draft' => null]);
});

it('400s a draft without an answers object, and a draft once the brief is in', function () {
    $project = Project::factory()->create();
    pbSignIn(pbMember($project));
    $url = "/api/projects/{$project->id}/brief/draft";
    foreach ([[], ['answers' => 'text'], ['answers' => null]] as $body) {
        $this->putJson($url, $body)->assertStatus(400)->assertJsonPath('error.code', 'INVALID_BRIEF_DRAFT_PAYLOAD');
    }
    $project->forceFill(['status' => 'BRIEF_SUBMITTED'])->save();
    $this->putJson($url, ['answers' => pbAnswers()])->assertStatus(400)->assertJsonPath('error.code', 'BRIEF_LOCKED');
});

it('does not show a draft to an admin who is not a member', function () {
    $project = Project::factory()->create();
    ProjectBriefDraft::create(['project_id' => $project->id, 'answers' => (object) pbAnswers(), 'updated_by' => pbMember($project)->id]);
    $admin = Profile::factory()->admin()->create()->user;
    pbSignIn($admin);
    $this->getJson("/api/projects/{$project->id}/brief/draft")->assertStatus(404);
});

it('submits: version 1, BRIEF_SUBMITTED, system message, draft gone, audit rows, no email', function () {
    Mail::fake();
    $project = Project::factory()->create();
    $user = pbMember($project);
    ProjectBriefDraft::create(['project_id' => $project->id, 'answers' => (object) pbAnswers(), 'updated_by' => $user->id]);
    pbSignIn($user);
    $r = $this->postJson("/api/projects/{$project->id}/brief", pbAnswers(['brandName' => '  Acme  ']))->assertOk();
    expect($r->json('ok'))->toBeTrue()->and($r->json('version'))->toBe(1);
    expect(DB::table('projects')->where('id', $project->id)->value('status'))->toBe('BRIEF_SUBMITTED')
        ->and(DB::table('project_brief_drafts')->count())->toBe(0)
        ->and(DB::table('messages')->where('project_id', $project->id)->where('kind', 'system')->value('body'))->toBe('Brief received. Your designer will review and reply soon.')
        ->and(DB::table('audit_events')->where('project_id', $project->id)->pluck('type')->sort()->values()->all())->toBe(['brief_submitted', 'state_changed'])
        ->and(ProjectBrief::query()->count())->toBe(1);
    Mail::assertNothingSent();
    Mail::assertNothingQueued();
    $b = $this->getJson("/api/projects/{$project->id}/brief")->assertOk()->json('brief');
    expect($b['id'])->toBe($r->json('briefId'))->and($b['version'])->toBe(1)->and($b['answers']['brandName'])->toBe('Acme')->and($b['createdBy'])->toBe($user->id);
});

it('400s an incomplete brief naming the missing fields, and a second submit with BRIEF_LOCKED', function () {
    $project = Project::factory()->create();
    pbSignIn(pbMember($project));
    $r = $this->postJson("/api/projects/{$project->id}/brief", pbAnswers(['usageContexts' => '', 'businessGoals' => '  ']))->assertStatus(400);
    expect($r->json('error.code'))->toBe('INVALID_BRIEF_PAYLOAD')->and($r->getContent())->toContain('businessGoals, usageContexts');
    // A blank brandName/industry/offerSummary is the generic three-field message (`parseBriefAnswers` returns null), as Next.
    $this->postJson("/api/projects/{$project->id}/brief", pbAnswers(['brandName' => ' ']))->assertStatus(400)->assertSee('brandName, industry, offerSummary');
    $this->postJson("/api/projects/{$project->id}/brief", [])->assertStatus(400)->assertJsonPath('error.code', 'INVALID_BRIEF_PAYLOAD');
    expect(DB::table('project_briefs')->count())->toBe(0);
    $this->postJson("/api/projects/{$project->id}/brief", pbAnswers())->assertOk();
    $this->postJson("/api/projects/{$project->id}/brief", pbAnswers())->assertStatus(400)->assertJsonPath('error.code', 'BRIEF_LOCKED');
    expect(DB::table('project_briefs')->count())->toBe(1)->and(DB::table('messages')->where('kind', 'system')->count())->toBe(1);
});

it('rejects a mutation without a trusted origin', function () {
    $project = Project::factory()->create();
    pbSignIn(pbMember($project));
    $this->withHeaders(['Origin' => 'https://evil.example'])->postJson("/api/projects/{$project->id}/brief", pbAnswers())->assertStatus(403);
    $this->withHeaders(['Origin' => 'https://evil.example'])->putJson("/api/projects/{$project->id}/brief/draft", ['answers' => []])->assertStatus(403);
    $this->withHeaders(['Origin' => 'https://evil.example'])->deleteJson("/api/projects/{$project->id}/brief/draft")->assertStatus(403);
});

it('lets an admin read the brief but returns null before one exists', function () {
    $project = Project::factory()->create();
    pbSignIn(Profile::factory()->admin()->create()->user);
    $this->getJson("/api/projects/{$project->id}/brief")->assertOk()->assertExactJson(['brief' => null]);
});

it('DV-17: the brief system message dedupes since the last clean-slate reset, not across the whole thread', function () {
    $project = Project::factory()->create();
    $user = pbMember($project);
    $body = 'Brief received. Your designer will review and reply soon.';
    $thread = MessageThread::query()->create(['project_id' => $project->id]);
    Message::create(['thread_id' => $thread->id, 'project_id' => $project->id, 'sender_id' => $user->id, 'kind' => 'system', 'body' => $body]);
    usleep(5000);
    Audit::record('project_reset', $project, null, ['mode' => 'clean-slate']);
    usleep(5000);
    pbSignIn($user);
    $this->postJson("/api/projects/{$project->id}/brief", pbAnswers())->assertOk();
    expect(DB::table('messages')->where('project_id', $project->id)->where('body', $body)->count())->toBe(2);
});

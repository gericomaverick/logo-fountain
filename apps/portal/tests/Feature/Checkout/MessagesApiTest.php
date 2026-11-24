<?php

use App\Actions\Messages\PostSystemMessage;
use App\Jobs\SendLifecycleMail;
use App\Models\ClientMembership;
use App\Models\Concept;
use App\Models\Message;
use App\Models\MessageThread;
use App\Models\Profile;
use App\Models\Project;
use App\Models\ProjectReadState;
use App\Support\Audit;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Tests\Support\SessionRows;
use Tests\Support\TruncatesDatabaseAsOwner;

const MSG_ORIGIN = 'https://app.example.com';

uses(TruncatesDatabaseAsOwner::class);

// Story 6.10 (C-14, C-15, DV-14, DV-17, N-11): messages, read state, system-message dedupe.

beforeEach(function () {
    config(['session.driver' => 'database', 'mail.default' => 'array', 'mail.from.address' => 'from@example.test',
        'portal.public_site_url' => MSG_ORIGIN, 'portal.admin_notification_emails' => 'ops@example.test']);
    Queue::fake();
});

function msgSignIn($user): void
{
    $sid = substr(hash('sha256', $user->id), 0, 40);
    SessionRows::insert($sid, $user->id, time(), time(), true);
    test()->withCredentials()->withCookie(config('session.cookie'), $sid)->withHeaders(['Origin' => MSG_ORIGIN]);
}

function msgMember(Project $project)
{
    return ClientMembership::factory()->create(['client_id' => $project->client_id, 'role' => 'owner'])->profile->user;
}

it('lets a member post and list in order; the client message queues the admin notice', function () {
    $project = Project::factory()->create();
    $member = msgMember($project);
    msgSignIn($member);
    $res = $this->postJson("/api/projects/{$project->id}/messages", ['body' => '  hello  '])->assertCreated();
    expect($res->json('ok'))->toBeTrue()->and($res->json('message.body'))->toBe('hello')
        ->and($res->json('message.kind'))->toBe('user')->and($res->json('message.sender.id'))->toBe($member->id)
        ->and($res->json('message.sender.isAdmin'))->toBeFalse();
    $this->postJson("/api/projects/{$project->id}/messages", ['body' => 'second'])->assertCreated();
    $list = $this->getJson("/api/projects/{$project->id}/messages")->assertOk()->json('messages');
    expect(array_column($list, 'body'))->toBe(['hello', 'second']);
    Queue::assertPushed(SendLifecycleMail::class, 2);
    expect(DB::table('audit_events')->where('type', 'message_sent')->count())->toBe(2);
});

it('DV-14: an admin posts without a 500 and the profile is untouched; the client gets N-11 once', function () {
    $project = Project::factory()->create();
    msgMember($project);
    $admin = Profile::factory()->admin()->create();
    msgSignIn($admin->user);
    $res = $this->postJson("/api/projects/{$project->id}/messages", ['body' => 'from admin'])->assertCreated();
    expect($res->json('message.sender.isAdmin'))->toBeTrue()
        ->and(Profile::query()->find($admin->id)->is_admin)->toBeTrue();
    Queue::assertPushed(SendLifecycleMail::class, 1);
    Queue::assertPushed(SendLifecycleMail::class, fn ($j) => $j->subject === 'New message from your Logo Fountain designer');
    $messageId = $res->json('message.id');
    expect(DB::table('audit_events')->where('type', "email_sent:client_new_message:{$messageId}")->count())->toBe(1);
    $this->getJson("/api/projects/{$project->id}/messages")->assertOk();
    Queue::assertPushed(SendLifecycleMail::class, 1);
});

it('rejects an empty, missing, non-string or over-long body with INVALID_MESSAGE_BODY', function () {
    $project = Project::factory()->create();
    msgSignIn(msgMember($project));
    foreach ([['body' => '   '], [], ['body' => 5], ['body' => str_repeat('a', 2001)]] as $payload) {
        $this->postJson("/api/projects/{$project->id}/messages", $payload)->assertStatus(400)->assertJsonPath('error.code', 'INVALID_MESSAGE_BODY');
    }
    $this->postJson("/api/projects/{$project->id}/messages", ['body' => str_repeat('a', 2000)])->assertCreated();
    expect(Message::query()->count())->toBe(1);
});

it('guards: 401 anonymous, 404 for a non-member and an unknown id (no IDOR), read and write', function () {
    $origin = ['Origin' => MSG_ORIGIN];
    $project = Project::factory()->create();
    $other = Project::factory()->create();
    Message::query()->forceCreate(['thread_id' => MessageThread::query()->create(['project_id' => $other->id])->id,
        'project_id' => $other->id, 'sender_id' => Profile::factory()->create()->id, 'body' => 'secret']);
    $this->getJson("/api/projects/{$project->id}/messages")->assertStatus(401);
    $this->withHeaders($origin)->postJson("/api/projects/{$project->id}/messages", ['body' => 'x'])->assertStatus(401);
    $this->withHeaders($origin)->postJson("/api/projects/{$project->id}/read-state", ['area' => 'messages'])->assertStatus(401);
    msgSignIn(msgMember($project));
    foreach ([$other->id, fake()->uuid(), 'not-a-uuid'] as $id) {
        $this->getJson("/api/projects/{$id}/messages")->assertNotFound()->assertJsonPath('error.code', 'PROJECT_NOT_FOUND');
        $this->postJson("/api/projects/{$id}/messages", ['body' => 'x'])->assertNotFound();
        $this->postJson("/api/projects/{$id}/read-state", ['area' => 'messages'])->assertNotFound();
    }
    expect(Message::query()->where('project_id', $other->id)->count())->toBe(1)->and(ProjectReadState::query()->count())->toBe(0);
});

it('read-state: messages stamps the newest non-system message; a bad area is INVALID_AREA', function () {
    $project = Project::factory()->create();
    $member = msgMember($project);
    msgSignIn($member);
    $this->postJson("/api/projects/{$project->id}/read-state", ['area' => 'nope'])->assertStatus(400)->assertJsonPath('error.code', 'INVALID_AREA');
    $this->postJson("/api/projects/{$project->id}/read-state", [])->assertStatus(400);
    $sent = $this->postJson("/api/projects/{$project->id}/messages", ['body' => 'hi'])->json('message.createdAt');
    usleep(5000);
    PostSystemMessage::post($project->id, $member->id, 'Concept 1 is ready for review.');
    $this->postJson("/api/projects/{$project->id}/read-state", ['area' => 'messages'])->assertOk()->assertExactJson(['ok' => true]);
    $state = ProjectReadState::query()->where('user_id', $member->id)->first();
    expect($state->last_seen_messages_at->utc()->format('Y-m-d\TH:i:s.v\Z'))->toBe($sent)->and($state->last_seen_concepts_at)->toBeNull();
});

it('read-state: concepts uses published/approved concept activity only and keeps the other area', function () {
    $project = Project::factory()->create();
    $member = msgMember($project);
    Concept::factory()->status('draft')->create(['project_id' => $project->id, 'number' => 1, 'created_at' => '2030-01-01 00:00:00', 'updated_at' => '2030-01-01 00:00:00']);
    Concept::factory()->status('published')->create(['project_id' => $project->id, 'number' => 2, 'created_at' => '2026-01-01 00:00:00', 'updated_at' => '2026-02-03 04:05:06']);
    msgSignIn($member);
    $this->postJson("/api/projects/{$project->id}/messages", ['body' => 'hi']);
    $this->postJson("/api/projects/{$project->id}/read-state", ['area' => 'messages'])->assertOk();
    $this->postJson("/api/projects/{$project->id}/read-state", ['area' => 'concepts'])->assertOk();
    $state = ProjectReadState::query()->where('user_id', $member->id)->get();
    expect($state)->toHaveCount(1)->and($state[0]->last_seen_concepts_at->utc()->format('Y-m-d H:i:s'))->toBe('2026-02-03 04:05:06')
        ->and($state[0]->last_seen_messages_at)->not->toBeNull();
});

it('read-state works for an admin on any project', function () {
    $project = Project::factory()->create();
    $admin = Profile::factory()->admin()->create();
    msgSignIn($admin->user);
    $this->postJson("/api/projects/{$project->id}/read-state", ['area' => 'messages'])->assertOk();
    expect(ProjectReadState::query()->where('user_id', $admin->id)->count())->toBe(1);
});

it('DV-17: a system message dedupes by body, and posts again after a clean-slate reset', function () {
    $project = Project::factory()->create();
    $member = msgMember($project);
    $body = 'Concept 1 is ready for review.';
    PostSystemMessage::post($project->id, $member->id, $body);
    PostSystemMessage::post($project->id, $member->id, $body);
    PostSystemMessage::post($project->id, $member->id, 'Another line.');
    expect(Message::query()->where('kind', 'system')->count())->toBe(2);
    Audit::record('project_reset', $project, null, ['mode' => 'other']);
    PostSystemMessage::post($project->id, $member->id, $body);
    expect(Message::query()->where('kind', 'system')->count())->toBe(2);
    usleep(5000);
    Audit::record('project_reset', $project, null, ['mode' => 'clean-slate']);
    usleep(5000);
    PostSystemMessage::post($project->id, $member->id, $body);
    PostSystemMessage::post($project->id, $member->id, $body);
    expect(Message::query()->where('kind', 'system')->where('body', $body)->count())->toBe(2);
    $b = Project::factory()->create();
    Audit::record('project_reset', $b, null, ['mode' => 'clean-slate']);
    usleep(5000);
    PostSystemMessage::post($project->id, $member->id, $body);
    expect(Message::query()->where('project_id', $project->id)->where('body', $body)->count())->toBe(2);
});

it('system messages use an admin profile as sender when one exists, else the fallback', function () {
    $project = Project::factory()->create();
    $member = msgMember($project);
    PostSystemMessage::post($project->id, $member->id, 'A');
    $admin = Profile::factory()->admin()->create();
    PostSystemMessage::post($project->id, $member->id, 'B');
    expect(Message::query()->where('body', 'A')->value('sender_id'))->toBe($member->id)
        ->and(Message::query()->where('body', 'B')->value('sender_id'))->toBe($admin->id);
});

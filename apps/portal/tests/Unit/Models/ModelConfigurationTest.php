<?php

use App\Models\AuditEvent;
use App\Models\AuthProof;
use App\Models\AuthRateLimit;
use App\Models\Client;
use App\Models\ClientMembership;
use App\Models\Concept;
use App\Models\ConceptComment;
use App\Models\FileAsset;
use App\Models\Message;
use App\Models\MessageThread;
use App\Models\Profile;
use App\Models\Project;
use App\Models\ProjectBrief;
use App\Models\ProjectBriefDraft;
use App\Models\ProjectEntitlement;
use App\Models\ProjectOrder;
use App\Models\ProjectReadState;
use App\Models\RevisionRequest;
use App\Models\StripeEvent;
use App\Models\User;
use App\Support\DatabaseRoles;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/*
 * Story 2.2 AC 1: one model per 2.1 domain table, with the key and timestamp configuration of the 2.1
 * handover (`2-1-schema-migrations-and-roles.md:185`).
 */

const UUID_V7 = '/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/';

/** @return array<string, array{class-string<Model>, string, string, bool, ?string, ?string}> */
function modelTables(): array
{
    return [
        // class, table, key, uuid key, created_at column, updated_at column
        'users' => [User::class, 'users', 'id', true, 'created_at', 'updated_at'],
        'profiles' => [Profile::class, 'profiles', 'id', false, 'created_at', 'updated_at'],
        'clients' => [Client::class, 'clients', 'id', true, 'created_at', 'updated_at'],
        'client_memberships' => [ClientMembership::class, 'client_memberships', 'id', true, 'created_at', null],
        'projects' => [Project::class, 'projects', 'id', true, 'created_at', 'updated_at'],
        'project_briefs' => [ProjectBrief::class, 'project_briefs', 'id', true, 'created_at', null],
        'project_brief_drafts' => [ProjectBriefDraft::class, 'project_brief_drafts', 'project_id', false, null, 'updated_at'],
        'project_orders' => [ProjectOrder::class, 'project_orders', 'id', true, 'created_at', 'updated_at'],
        'project_entitlements' => [ProjectEntitlement::class, 'project_entitlements', 'id', true, 'created_at', 'updated_at'],
        'concepts' => [Concept::class, 'concepts', 'id', true, 'created_at', 'updated_at'],
        'file_assets' => [FileAsset::class, 'file_assets', 'id', true, 'created_at', 'updated_at'],
        'message_threads' => [MessageThread::class, 'message_threads', 'id', true, 'created_at', 'updated_at'],
        'messages' => [Message::class, 'messages', 'id', true, 'created_at', null],
        'revision_requests' => [RevisionRequest::class, 'revision_requests', 'id', true, 'created_at', 'updated_at'],
        'concept_comments' => [ConceptComment::class, 'concept_comments', 'id', true, 'created_at', null],
        'audit_events' => [AuditEvent::class, 'audit_events', 'id', true, 'created_at', null],
        'project_read_states' => [ProjectReadState::class, 'project_read_states', 'id', true, 'created_at', 'updated_at'],
        'stripe_events' => [StripeEvent::class, 'stripe_events', 'event_id', false, null, null],
        'auth_proofs' => [AuthProof::class, 'auth_proofs', 'token_hash', false, null, null],
        'auth_rate_limits' => [AuthRateLimit::class, 'auth_rate_limits', 'key', false, null, null],
    ];
}

dataset('models', modelTables());

it('maps the table, key and timestamps as the 2.1 schema has them', function (string $class, string $table, string $key, bool $uuid, ?string $createdAt, ?string $updatedAt) {
    /** @var Model $model */
    $model = new $class;

    expect($model->getTable())->toBe($table)
        ->and($model->getKeyName())->toBe($key)
        ->and($model->getKeyType())->toBe('string')
        ->and($model->getIncrementing())->toBeFalse()
        ->and(in_array(HasUuids::class, class_uses_recursive($model), true))->toBe($uuid)
        ->and($model->getDateFormat())->toBe('Y-m-d H:i:s.v');

    $timestamps = array_values(array_filter([$createdAt, $updatedAt]));
    expect($model->usesTimestamps())->toBe($timestamps !== []);
    if ($model->usesTimestamps()) {
        expect($model->getCreatedAtColumn())->toBe($createdAt)
            ->and($model->getUpdatedAtColumn())->toBe($updatedAt);
    }

    // Every column the model writes as a timestamp exists; a missing updated_at is never written.
    $connection = $model->getConnectionName() ?? DatabaseRoles::RUNTIME;
    foreach ($timestamps as $column) {
        expect(Schema::connection($connection)->hasColumn($table, $column))->toBeTrue();
    }
    if ($updatedAt === null) {
        expect(Schema::connection($connection)->hasColumn($table, 'updated_at'))->toBeFalse();
    }
    if ($uuid) {
        expect($model->newUniqueId())->toMatch(UUID_V7);
    }
})->with('models');

it('covers every 2.1 domain table with a model', function () {
    $tables = collect(Schema::getTables())->where('schema', 'public')->pluck('name')
        ->diff(['migrations', 'sessions', 'cache', 'cache_locks', 'jobs', 'job_batches', 'failed_jobs', 'password_reset_tokens', 'auth_admin_bootstrap'])
        ->sort()->values()->all();
    $modelled = collect(modelTables())->pluck(1)->sort()->values()->all();

    expect($modelled)->toBe($tables);
});

it('keeps auth rate limits on the limits connection', function () {
    expect((new AuthRateLimit)->getConnectionName())->toBe(DatabaseRoles::LIMITS);
});

it('saves a uuid v7 key, and a profile keyed by its user', function () {
    $client = Client::factory()->create();
    $profile = Profile::factory()->create();

    expect($client->id)->toMatch(UUID_V7)
        ->and($profile->id)->toBe($profile->user->id)
        ->and($profile->user->profile?->id)->toBe($profile->id);
});

it('writes and reads milliseconds', function () {
    $client = Client::factory()->create(['created_at' => '2026-11-22 10:11:12.123']);

    expect($client->fresh()?->created_at?->format('Y-m-d H:i:s.v'))->toBe('2026-11-22 10:11:12.123')
        ->and((string) DB::table('clients')->where('id', $client->id)->value('created_at'))->toBe('2026-11-22 10:11:12.123');

    $state = ProjectReadState::query()->create([
        'user_id' => Profile::factory()->create()->id,
        'project_id' => Project::factory()->create()->id,
        'last_seen_messages_at' => '2026-11-22 10:11:12.456',
    ]);

    expect($state->fresh()?->last_seen_messages_at?->format('v'))->toBe('456');
});

it('saves the immutable and draft tables without touching a missing timestamp column', function () {
    $project = Project::factory()->create();
    $author = Profile::factory()->create();
    $thread = MessageThread::query()->create(['project_id' => $project->id]);

    $message = Message::query()->create(['thread_id' => $thread->id, 'project_id' => $project->id, 'sender_id' => $author->id, 'body' => 'hi']);
    $brief = ProjectBrief::query()->create(['project_id' => $project->id, 'version' => 1, 'answers' => new stdClass, 'created_by' => $author->id]);
    $draft = ProjectBriefDraft::query()->create(['project_id' => $project->id, 'answers' => ['a' => 1], 'updated_by' => $author->id]);
    $before = $draft->updated_at;
    $this->travel(5)->seconds();
    $draft->update(['answers' => ['a' => 2]]);

    expect($message->fresh()?->created_at)->not->toBeNull()
        ->and($brief->fresh()?->created_at)->not->toBeNull()
        ->and($draft->fresh()?->updated_at?->greaterThan($before))->toBeTrue();
});

it('normalises users.email and profiles.email as normalizeAuthEmail', function () {
    $raw = " \u{00A0}A@B.Test\u{FEFF} ";
    $user = User::factory()->create(['email' => $raw]);
    $profile = User::factory()->create()->profile()->create(['email' => $raw]);

    expect($user->fresh()?->email)->toBe('a@b.test')
        ->and($profile->fresh()?->email)->toBe('a@b.test');
});

it('never mass-assigns is_admin or the project version', function () {
    $user = User::factory()->create();
    $profile = $user->profile()->create(['email' => $user->email, 'is_admin' => true]);

    expect((new Profile)->isFillable('is_admin'))->toBeFalse()
        ->and($profile->fresh()?->is_admin)->toBeFalse()
        ->and((new Project)->isFillable('version'))->toBeFalse();
});

it('round-trips audit payloads {} and [] exactly', function (string $json) {
    $event = AuditEvent::query()->create(['type' => 'test.payload', 'payload' => json_decode($json)]);
    $stored = (string) DB::table('audit_events')->where('id', $event->id)->value('payload');

    expect(json_encode($event->fresh()?->payload))->toBe($json)
        ->and(json_encode(json_decode($stored)))->toBe($json);
})->with(['{}', '[]', '{"a":{},"b":[]}']);

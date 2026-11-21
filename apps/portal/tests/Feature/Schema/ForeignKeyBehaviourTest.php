<?php

use App\Support\DatabaseRoles;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Support\PortalRows;

// Story 2.1 AC 7 (X-15): each FK's delete action, exercised from the runtime connection. Each case makes a
// fresh parent with exactly one child row pointing at it (everything else points at a shared base graph),
// deletes the parent and checks the child.

/**
 * @return array{key: string, row: array<string, mixed>}
 */
function childRow(string $table, string $column, string $parentId, PortalRows $rows): array
{
    $profile = $rows->profile();
    $client = $rows->client();
    $project = $rows->project($client);
    $concept = $rows->concept($project);
    $thread = $rows->thread($project);
    $now = now()->toDateTimeString('millisecond');

    $defaults = [
        'profiles' => ['email' => 'child-'.Str::uuid().'@example.test'],
        'client_memberships' => ['client_id' => $client, 'user_id' => $profile, 'role' => 'owner'],
        'projects' => ['client_id' => $client, 'status' => 'active', 'package_code' => 'essential'],
        'project_briefs' => ['project_id' => $project, 'version' => 1, 'answers' => '{}', 'created_by' => $profile],
        'project_brief_drafts' => ['project_id' => $project, 'answers' => '{}', 'updated_by' => $profile, 'updated_at' => $now],
        'project_orders' => ['project_id' => $project, 'client_id' => $client, 'status' => 'FULFILLED', 'currency' => 'gbp', 'total_cents' => 29900],
        'project_entitlements' => ['project_id' => $project, 'key' => 'concepts', 'limit_int' => 2],
        'concepts' => ['project_id' => $project, 'number' => 1, 'status' => 'draft'],
        'file_assets' => ['project_id' => $project, 'kind' => 'concept', 'bucket' => 'concepts', 'path' => 'a.png', 'mime' => 'image/png', 'size' => 1, 'uploaded_by' => $profile],
        'message_threads' => ['project_id' => $project],
        'messages' => ['thread_id' => $thread, 'project_id' => $project, 'sender_id' => $profile, 'body' => 'hi'],
        'revision_requests' => ['project_id' => $project, 'concept_id' => $concept, 'status' => 'requested', 'requested_by' => $profile, 'body' => 'change'],
        'concept_comments' => ['project_id' => $project, 'concept_id' => $concept, 'author_id' => $profile, 'body' => 'nice'],
        'audit_events' => ['project_id' => $project, 'actor_id' => $profile, 'type' => 'test', 'payload' => '{}'],
        'project_read_states' => ['user_id' => $profile, 'project_id' => $project],
        'auth_proofs' => ['token_hash' => hash('sha256', (string) Str::uuid()), 'user_id' => $profile, 'kind' => 'setup', 'credential_version' => 0, 'expires_at' => $now],
        'sessions' => ['id' => Str::random(40), 'user_id' => $profile, 'payload' => '', 'last_activity' => time()],
    ];
    $key = ['project_brief_drafts' => 'project_id', 'auth_proofs' => 'token_hash'][$table] ?? 'id';
    $row = [...$defaults[$table], $column => $parentId];
    $row[$key] ??= (string) Str::uuid();
    DB::table($table)->insert($row);

    return ['key' => $key, 'row' => $row];
}

function freshParent(string $table, PortalRows $rows): string
{
    return match ($table) {
        'users' => $rows->user(),
        'profiles' => $rows->profile(),
        'clients' => $rows->client(),
        'projects' => $rows->project($rows->client()),
        'concepts' => $rows->concept($rows->project($rows->client())),
        'message_threads' => $rows->thread($rows->project($rows->client())),
        default => throw new LogicException($table),
    };
}

it('applies the delete action', function (string $table, string $column, string $parent, string $action) {
    $rows = new PortalRows(DatabaseRoles::RUNTIME);
    $parentId = freshParent($parent, $rows);
    ['key' => $key, 'row' => $row] = childRow($table, $column, $parentId, $rows);
    $child = fn () => DB::table($table)->where($key, $row[$key])->first();

    if ($action === 'restrict') {
        try {
            DB::table($parent)->where('id', $parentId)->delete();
            throw new RuntimeException('delete was not refused');
        } catch (QueryException $e) {
            // ON DELETE RESTRICT raises restrict_violation (23001), as Next's RESTRICT FKs do; NO ACTION would be 23503.
            expect($e->getCode())->toBe('23001');
        }

        return;
    }

    expect(DB::table($parent)->where('id', $parentId)->delete())->toBe(1);
    if ($action === 'cascade') {
        expect($child())->toBeNull();
    } else {
        expect($child())->not->toBeNull()->and($child()->{$column})->toBeNull();
    }
})->with([
    ['client_memberships', 'client_id', 'clients', 'cascade'],
    ['client_memberships', 'user_id', 'profiles', 'cascade'],
    ['projects', 'client_id', 'clients', 'cascade'],
    ['project_briefs', 'project_id', 'projects', 'cascade'],
    ['project_brief_drafts', 'project_id', 'projects', 'cascade'],
    ['project_orders', 'project_id', 'projects', 'cascade'],
    ['project_orders', 'client_id', 'clients', 'cascade'],
    ['project_entitlements', 'project_id', 'projects', 'cascade'],
    ['concepts', 'project_id', 'projects', 'cascade'],
    ['file_assets', 'project_id', 'projects', 'cascade'],
    ['message_threads', 'project_id', 'projects', 'cascade'],
    ['messages', 'thread_id', 'message_threads', 'cascade'],
    ['messages', 'project_id', 'projects', 'cascade'],
    ['revision_requests', 'project_id', 'projects', 'cascade'],
    ['concept_comments', 'project_id', 'projects', 'cascade'],
    ['concept_comments', 'concept_id', 'concepts', 'cascade'],
    ['audit_events', 'project_id', 'projects', 'cascade'],
    ['project_read_states', 'user_id', 'profiles', 'cascade'],
    ['project_read_states', 'project_id', 'projects', 'cascade'],
    ['auth_proofs', 'user_id', 'users', 'cascade'],
    ['sessions', 'user_id', 'users', 'cascade'],
    ['profiles', 'id', 'users', 'restrict'],
    ['project_briefs', 'created_by', 'profiles', 'restrict'],
    ['project_brief_drafts', 'updated_by', 'profiles', 'restrict'],
    ['file_assets', 'uploaded_by', 'profiles', 'restrict'],
    ['messages', 'sender_id', 'profiles', 'restrict'],
    ['revision_requests', 'requested_by', 'profiles', 'restrict'],
    ['concept_comments', 'author_id', 'profiles', 'restrict'],
    ['revision_requests', 'concept_id', 'concepts', 'set null'],
    ['audit_events', 'actor_id', 'profiles', 'set null'],
]);

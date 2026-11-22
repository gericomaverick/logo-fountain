<?php

namespace Tests\Support;

use App\Support\DatabaseRoles;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Story 2.7: committed rows (through the owner connection) for the lifecycle-mail tests. */
final class MailFixtures
{
    /**
     * @param  list<array{role: string, email: string, first?: string, last?: string, full?: string}>  $members
     * @param  array<string, mixed>|null  $brief  answers of a version-1 brief
     * @return array{project: string, client: string}
     */
    public static function project(?string $billing = null, array $members = [], string $clientName = 'Acme', ?array $brief = null): array
    {
        $db = DB::connection(DatabaseRoles::MIGRATE);
        $client = (string) Str::uuid();
        $db->table('clients')->insert(['id' => $client, 'name' => $clientName, 'slug' => "c-{$client}", 'billing_email' => $billing]);
        $project = (string) Str::uuid();
        $db->table('projects')->insert(['id' => $project, 'client_id' => $client, 'status' => 'active', 'package_code' => 'essential']);
        $first = null;
        foreach ($members as $i => $m) {
            $id = (string) Str::uuid();
            $first ??= $id;
            $db->table('users')->insert(['id' => $id, 'name' => 'U', 'email' => "u-{$id}@example.test"]);
            $db->table('profiles')->insert(['id' => $id, 'email' => $m['email'], 'first_name' => $m['first'] ?? null, 'last_name' => $m['last'] ?? null, 'full_name' => $m['full'] ?? null]);
            $db->table('client_memberships')->insert(['id' => (string) Str::uuid(), 'client_id' => $client, 'user_id' => $id, 'role' => $m['role'], 'created_at' => now()->addSeconds($i)]);
        }
        if ($brief !== null) {
            $by = $first ?? (string) Str::uuid();
            if ($first === null) {
                $db->table('users')->insert(['id' => $by, 'name' => 'U', 'email' => "u-{$by}@example.test"]);
                $db->table('profiles')->insert(['id' => $by, 'email' => "p-{$by}@example.test"]);
            }
            $db->table('project_briefs')->insert(['id' => (string) Str::uuid(), 'project_id' => $project, 'version' => 1, 'answers' => json_encode($brief), 'created_by' => $by]);
        }

        return ['project' => $project, 'client' => $client];
    }

    public static function markers(string $project): int
    {
        return DB::connection(DatabaseRoles::MIGRATE)->table('audit_events')->where('project_id', $project)->where('type', 'like', 'email_sent:%')->count();
    }

    public static function jobs(): int
    {
        return DB::connection(DatabaseRoles::MIGRATE)->table('jobs')->count();
    }
}

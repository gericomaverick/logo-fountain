<?php

namespace Tests\Support;

use Illuminate\Database\ConnectionInterface;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Story 2.1: minimal valid rows for the schema tests, written through the given connection. Models and
 * factories arrive in story 2.2; this exists only so the DB guards can be exercised with plain SQL.
 */
final class PortalRows
{
    private static int $number = 100;

    private ConnectionInterface $db;

    public function __construct(string $connection)
    {
        $this->db = DB::connection($connection);
    }

    /** @param  array<string, mixed>  $overrides */
    public function user(array $overrides = []): string
    {
        $id = (string) Str::uuid();
        $this->db->table('users')->insert(['id' => $id, 'name' => 'Test user', 'email' => "u-{$id}@example.test", ...$overrides]);

        return $id;
    }

    /** @param  array<string, mixed>  $overrides */
    public function profile(?string $id = null, array $overrides = []): string
    {
        $id ??= $this->user();
        $this->db->table('profiles')->insert(['id' => $id, 'email' => "p-{$id}@example.test", ...$overrides]);

        return $id;
    }

    public function client(): string
    {
        $id = (string) Str::uuid();
        $this->db->table('clients')->insert(['id' => $id, 'name' => 'Client', 'slug' => "client-{$id}"]);

        return $id;
    }

    public function project(string $clientId): string
    {
        $id = (string) Str::uuid();
        $this->db->table('projects')->insert(['id' => $id, 'client_id' => $clientId, 'status' => 'active', 'package_code' => 'essential']);

        return $id;
    }

    public function concept(string $projectId): string
    {
        $id = (string) Str::uuid();
        $this->db->table('concepts')->insert(['id' => $id, 'project_id' => $projectId, 'number' => self::$number++, 'status' => 'draft']);

        return $id;
    }

    public function thread(string $projectId): string
    {
        $id = (string) Str::uuid();
        $this->db->table('message_threads')->insert(['id' => $id, 'project_id' => $projectId]);

        return $id;
    }
}

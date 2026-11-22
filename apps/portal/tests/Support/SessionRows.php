<?php

namespace Tests\Support;

use Illuminate\Support\Facades\DB;

/** Story 4.1: write a `sessions` row the way the database handler does (the test client encrypts the cookie itself). */
final class SessionRows
{
    public static function insert(string $id, ?string $userId, ?int $issuedAt, ?int $lastActivity = null): void
    {
        $data = ['_token' => 'tok'];
        if ($userId !== null) {
            $data['auth'] = ['user_id' => $userId, 'issued_at' => $issuedAt];
        }
        DB::table('sessions')->insert([
            'id' => $id,
            'user_id' => $userId,
            'payload' => base64_encode((string) json_encode($data)),
            'last_activity' => $lastActivity ?? time(),
        ]);
    }
}

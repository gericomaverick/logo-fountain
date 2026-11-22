<?php

namespace Tests\Support;

use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Testing\TestResponse;

/** Story 4.3: a login request as a browser sends it (canonical Origin, JSON), and a user to sign in as. */
final class LoginRequests
{
    public const PASSWORD = 'correct horse battery';

    public static function user(array $attributes = []): User
    {
        return User::factory()->create($attributes + ['password' => Hash::make(self::PASSWORD)]);
    }

    /** @param  array<string, mixed>  $body */
    public static function post(array $body, ?string $address = null, string $origin = 'https://app.example.com'): TestResponse
    {
        config(['portal.public_site_url' => 'https://app.example.com']);
        $headers = ['Origin' => $origin];
        if ($address !== null) {
            $headers['Cf-Connecting-Ip'] = $address;
        }

        return test()->withHeaders($headers)->postJson('/api/auth/login', $body);
    }
}

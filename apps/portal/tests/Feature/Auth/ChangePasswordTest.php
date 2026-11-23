<?php

use App\Actions\Auth\ChangePassword;
use App\Exceptions\AuthFailure;
use App\Models\Profile;
use App\Models\User;
use App\Support\Auth\AuthProofs;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Testing\TestResponse;
use Tests\Support\SessionRows;

// Story 4.7 AC 3-8 (A-09; ledger password/route.test.ts, validation.test.ts change cases).

const CHG_OLD = 'old password 123';
const CHG_NEW = 'a brand new password';
const CHG_MSG = 'Authentication could not be completed. Check your details or request a new link.';

beforeEach(function () {
    config(['session.driver' => 'database', 'portal.public_site_url' => 'https://app.example.com', 'portal.auth_client_ip_header' => 'cf-connecting-ip']);
});

function chgUser(): array
{
    $user = User::factory()->create(['password' => Hash::make(CHG_OLD)]);
    Profile::factory()->create(['id' => $user->id]);
    $id = str_repeat('c', 40);
    SessionRows::insert($id, $user->id, time(), time(), true);
    SessionRows::insert('other-session', $user->id, time(), time(), true);

    return [$user, $id];
}

function postChange(?string $sessionId, array $body, string $address = '203.0.113.7'): TestResponse
{
    $t = test()->withHeaders(['Origin' => 'https://app.example.com', 'Cf-Connecting-Ip' => $address]);
    if ($sessionId !== null) {
        $t = $t->withCredentials()->withCookie(config('session.cookie'), $sessionId);
    }

    return $t->postJson('/api/auth/password', $body);
}

it('changes the password, signs out everywhere and audits', function () {
    [$user, $id] = chgUser();
    AuthProofs::issue($user, 'magic');

    $r = postChange($id, ['currentPassword' => CHG_OLD, 'newPassword' => CHG_NEW]);

    $r->assertOk()->assertExactJson(['ok' => true, 'signedOut' => true]);
    $cookie = collect($r->baseResponse->headers->getCookies())->first(fn ($c) => $c->getName() === config('session.cookie'));
    $row = DB::table('users')->where('id', $user->id)->first();
    expect($cookie->getExpiresTime())->toBeLessThan(time())
        ->and(Hash::check(CHG_NEW, $row->password))->toBeTrue()
        ->and((int) $row->credential_version)->toBe(1)
        ->and(DB::table('sessions')->where('user_id', $user->id)->count())->toBe(0)
        ->and(DB::table('auth_proofs')->count())->toBe(0)
        ->and(json_decode((string) DB::table('audit_events')->where('type', 'auth.password_changed')->value('payload'), true))->toBe(['method' => 'settings']);
    test()->withCredentials()->withCookie(config('session.cookie'), $id)->getJson('/api/auth/session')->assertExactJson(['authenticated' => false]);
});

it('answers 401 for an anonymous caller before the limiter', function () {
    postChange(null, ['currentPassword' => CHG_OLD, 'newPassword' => CHG_NEW])->assertStatus(401)
        ->assertExactJson(['error' => ['code' => 'UNAUTHORIZED', 'message' => CHG_MSG]]);
    expect(DB::table('auth_rate_limits')->count())->toBe(0);
});

it('refuses invalid changes with INVALID_PASSWORD_CHANGE', function (array $body) {
    [, $id] = chgUser();

    postChange($id, $body)->assertStatus(400)->assertJsonPath('error.code', 'INVALID_PASSWORD_CHANGE');
})->with([
    'empty current' => [['currentPassword' => '', 'newPassword' => CHG_NEW]],
    'same' => [['currentPassword' => CHG_OLD, 'newPassword' => CHG_OLD]],
    'weak' => [['currentPassword' => CHG_OLD, 'newPassword' => 'short']],
    'too long' => [['currentPassword' => CHG_OLD, 'newPassword' => str_repeat('a', 73)]],
    'missing' => [['other' => 1]],
]);

it('refuses a wrong current password and changes nothing', function () {
    [$user, $id] = chgUser();

    postChange($id, ['currentPassword' => 'not the password', 'newPassword' => CHG_NEW])
        ->assertStatus(400)->assertJsonPath('error.code', 'CURRENT_PASSWORD_INVALID');

    expect(Hash::check(CHG_OLD, (string) DB::table('users')->where('id', $user->id)->value('password')))->toBeTrue()
        ->and(DB::table('sessions')->where('user_id', $user->id)->count())->toBe(2);
});

it('limits the sixth attempt per user', function () {
    [, $id] = chgUser();
    foreach (range(1, 5) as $_) {
        postChange($id, ['currentPassword' => 'wrong wrong', 'newPassword' => CHG_NEW])->assertStatus(400);
    }

    postChange($id, ['currentPassword' => 'wrong wrong', 'newPassword' => CHG_NEW])
        ->assertStatus(429)->assertExactJson(['error' => ['code' => 'RATE_LIMITED']]);
});

it('treats a session past the seven-day cap as anonymous', function () {
    $user = User::factory()->create(['password' => Hash::make(CHG_OLD)]);
    $id = str_repeat('d', 40);
    SessionRows::insert($id, $user->id, time() - 8 * 86400, time());

    postChange($id, ['currentPassword' => CHG_OLD, 'newPassword' => CHG_NEW])->assertStatus(401);

    expect(Hash::check(CHG_OLD, (string) DB::table('users')->where('id', $user->id)->value('password')))->toBeTrue();
});

// Story 4.7 AC 6, ChangePassword.php:33-34: under the fence the session row and the verified mailbox are re-read.
it('refuses at the action when the session row is gone, changing nothing', function () {
    [$user, $id] = chgUser();
    DB::table('sessions')->where('id', $id)->delete();

    expect(fn () => app(ChangePassword::class)->handle($user->id, $id, time(), CHG_OLD, CHG_NEW))
        ->toThrow(fn (AuthFailure $e) => expect($e->status)->toBe(401));

    expect(Hash::check(CHG_OLD, (string) DB::table('users')->where('id', $user->id)->value('password')))->toBeTrue()
        ->and(DB::table('sessions')->where('id', 'other-session')->exists())->toBeTrue();
});

it('refuses at the action when the mailbox is unverified, changing nothing', function () {
    [$user, $id] = chgUser();
    DB::table('users')->where('id', $user->id)->update(['email_verified_at' => null]);

    expect(fn () => app(ChangePassword::class)->handle($user->id, $id, time(), CHG_OLD, CHG_NEW))
        ->toThrow(fn (AuthFailure $e) => expect($e->status)->toBe(401));

    expect(Hash::check(CHG_OLD, (string) DB::table('users')->where('id', $user->id)->value('password')))->toBeTrue()
        ->and(DB::table('sessions')->where('user_id', $user->id)->count())->toBe(2);
});

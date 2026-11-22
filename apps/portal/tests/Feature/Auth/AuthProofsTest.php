<?php

use App\Exceptions\AuthFailure;
use App\Models\User;
use App\Support\Auth\AuthProofs;
use App\Support\Auth\CredentialFence;
use App\Support\Scrubber;
use Illuminate\Database\Connection;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

// Story 4.2 AC 3-5, 8 (A-11 proof half, ADR-006).

function checkProof(string $token, array $kinds = AuthProofs::KINDS): mixed
{
    return CredentialFence::run(AuthProofs::userFor($token), fn (Connection $db) => AuthProofs::validate($db, $token, $kinds));
}

beforeEach(fn () => Carbon::setTestNow('2026-11-22 12:00:00'));
afterEach(fn () => Carbon::setTestNow());

it('issues a token once and stores only its hash, kind, version and expiry', function () {
    $user = User::factory()->create();
    DB::table('users')->where('id', $user->id)->update(['credential_version' => 3]);

    $token = AuthProofs::issue($user, 'reset');
    $row = DB::table('auth_proofs')->first();

    expect($token)->toMatch(AuthProofs::SHAPE)->and(strlen($token))->toBeGreaterThanOrEqual(43)
        ->and($row->token_hash)->toBe(hash('sha256', $token))
        ->and($row->kind)->toBe('reset')
        ->and($row->credential_version)->toBe(3)
        ->and(Carbon::parse($row->expires_at, 'UTC')->timestamp)->toBe(Carbon::now()->addHour()->timestamp)
        ->and(json_encode(DB::table('auth_proofs')->get()))->not->toContain($token);
});

it('rejects an unknown kind at issue', function () {
    expect(fn () => AuthProofs::issue(User::factory()->create(), 'admin'))->toThrow(InvalidArgumentException::class);
});

it('validates a fresh proof of an allowed kind', function () {
    $user = User::factory()->create();
    $proof = checkProof(AuthProofs::issue($user, 'magic'), ['magic', 'setup']);

    expect($proof->user_id)->toBe($user->id);
});

it('checks the shape before any database work', function (string $token) {
    DB::enableQueryLog();
    expect(fn () => AuthProofs::userFor($token))->toThrow(AuthFailure::class);
    expect(DB::getQueryLog())->toBe([]);
})->with(['empty' => [''], 'short' => [str_repeat('a', 19)], 'long' => [str_repeat('a', 257)], 'bad char' => [str_repeat('a', 30).'!'], 'space' => [str_repeat('a', 30).' ']]);

it('treats an unknown token, a wrong kind and an expired proof alike', function () {
    $user = User::factory()->create();
    $token = AuthProofs::issue($user, 'reset');

    expect(fn () => checkProof(str_repeat('z', 43)))->toThrow(AuthFailure::class)
        ->and(fn () => checkProof($token, ['setup']))->toThrow(AuthFailure::class);
});

it('kills a proof exactly at its expiry', function (int $seconds, bool $live) {
    $user = User::factory()->create();
    $token = AuthProofs::issue($user, 'reset');
    Carbon::setTestNow(Carbon::now()->addSeconds($seconds));

    $live ? expect(checkProof($token))->not->toBeNull() : expect(fn () => checkProof($token))->toThrow(AuthFailure::class);
})->with([[3599, true], [3600, false], [3601, false]]);

it('kills every outstanding proof, of every kind, when the credential version moves', function () {
    $user = User::factory()->create();
    $tokens = array_map(fn ($k) => AuthProofs::issue($user, $k), ['setup', 'reset', 'magic']);
    DB::table('users')->where('id', $user->id)->increment('credential_version');

    foreach ($tokens as $token) {
        expect(fn () => checkProof($token))->toThrow(AuthFailure::class);
    }
});

it('consumes a proof by deleting it', function () {
    $user = User::factory()->create();
    $token = AuthProofs::issue($user, 'reset');
    CredentialFence::run($user->id, fn (Connection $db) => AuthProofs::consume($db, AuthProofs::validate($db, $token, ['reset'])));

    expect(fn () => checkProof($token))->toThrow(AuthFailure::class);
});

it('keeps tokens and hashes out of scrubbed log output', function () {
    $user = User::factory()->create();
    $token = AuthProofs::issue($user, 'reset');
    $hash = AuthProofs::hash($token);

    $scrubbed = json_encode(Scrubber::scrub([
        'token' => $token,
        'tokenHash' => $hash,
        'link' => "https://portal.example.test/auth/reset#token={$token}",
    ]));

    expect($scrubbed)->not->toContain($token)->and($scrubbed)->not->toContain($hash);
});

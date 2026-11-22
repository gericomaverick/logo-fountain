<?php

use App\Actions\Auth\SendAuthLink;
use App\Models\User;
use App\Support\Auth\AuthProofs;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Tests\Support\ProbeTransport;

// Story 4.4 AC 4-7 (A-06 link half, A-11 send half; ledger #66 cases 8-10).

beforeEach(function () {
    config(['portal.public_site_url' => 'https://app.example.com']);
    ProbeTransport::install();
});

function sentLink(): string
{
    preg_match('#https://app\.example\.com/\S+#', (string) ProbeTransport::$sent[0]->getTextBody(), $m);

    return $m[0];
}

it('issues one proof and sends one email per kind, token in the fragment', function (string $kind, string $path) {
    $user = User::factory()->create(['password' => null]); // setup needs an account with no password

    $issued = app(SendAuthLink::class)->handle($user, $kind, '/projects');

    $link = sentLink();
    expect($issued)->toBe($kind)->and(ProbeTransport::$sent)->toHaveCount(1)
        ->and(DB::table('auth_proofs')->where('user_id', $user->id)->where('kind', $kind)->count())->toBe(1)
        ->and(parse_url($link, PHP_URL_PATH))->toBe($path)->and(parse_url($link, PHP_URL_QUERY))->toBeNull();
    parse_str((string) parse_url($link, PHP_URL_FRAGMENT), $fragment);
    expect($fragment['token'])->toMatch(AuthProofs::SHAPE)->and($fragment['next'])->toBe('/dashboard') // SafeNext stub until 4.8
        ->and(DB::table('auth_proofs')->where('token_hash', AuthProofs::hash($fragment['token']))->exists())->toBeTrue()
        ->and(DB::table('auth_proofs')->where('token_hash', $fragment['token'])->exists())->toBeFalse();
})->with([['magic', '/auth/callback'], ['reset', '/reset-password'], ['setup', '/set-password']]);

it('degrades setup to a sign-in link when a password exists, and leaves the password alone', function () {
    $user = User::factory()->create();
    $before = DB::table('users')->where('id', $user->id)->value('password');

    $issued = app(SendAuthLink::class)->handle($user, 'setup');

    expect($issued)->toBe('magic')->and(parse_url(sentLink(), PHP_URL_PATH))->toBe('/auth/callback')
        ->and(DB::table('users')->where('id', $user->id)->value('password'))->toBe($before);
});

it('issues setup for an account with no password', function () {
    expect(app(SendAuthLink::class)->handle(User::factory()->create(['password' => null]), 'setup'))->toBe('setup');
});

it('creates nothing for an unknown account', function () {
    $before = DB::table('users')->count();

    expect(app(SendAuthLink::class)->request('nobody@example.test', 'magic'))->toBeNull()
        ->and(DB::table('users')->count())->toBe($before)->and(DB::table('auth_proofs')->count())->toBe(0)->and(ProbeTransport::$sent)->toBe([]);
});

it('sends after commit: no transaction and no advisory lock while the message goes out', function () {
    $seen = [];
    ProbeTransport::install(function () use (&$seen) {
        $seen = [
            DB::connection()->transactionLevel(),
            (int) DB::selectOne("select count(*) as n from pg_locks where locktype = 'advisory' and pid = pg_backend_pid()")->n,
        ];
    });

    app(SendAuthLink::class)->handle(User::factory()->create(), 'reset');

    expect($seen)->toBe([0, 0]);
});

it('deletes the proof and leaks nothing when the send fails', function () {
    Log::spy();
    $leaked = null;
    ProbeTransport::install(function () use (&$leaked) {
        $leaked = (string) DB::table('auth_proofs')->value('token_hash');
        throw new RuntimeException('provider echoed https://app.example.com/reset-password#token=secret');
    });
    $user = User::factory()->create();

    try {
        app(SendAuthLink::class)->handle($user, 'reset');
        $thrown = null;
    } catch (Throwable $e) {
        $thrown = $e;
    }

    expect($thrown?->getMessage())->toBe('Authentication email delivery failed')->and($thrown?->getPrevious())->toBeNull()
        ->and($leaked)->not->toBe('')->and(DB::table('auth_proofs')->where('user_id', $user->id)->count())->toBe(0);
    Log::shouldNotHaveReceived('error');
});

it('treats missing delivery config as a failure and removes the proof', function () {
    config(['mail.from.address' => '']);
    $user = User::factory()->create();

    expect(fn () => app(SendAuthLink::class)->handle($user, 'magic'))->toThrow(RuntimeException::class, 'Authentication email delivery failed');
    expect(DB::table('auth_proofs')->count())->toBe(0);
});

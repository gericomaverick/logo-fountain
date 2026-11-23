<?php

use App\Actions\Auth\SendAuthLink;
use App\Jobs\SendAuthLinkMail;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Tests\Support\ProbeTransport;

// Story 4.4 AC 1-3, 11 (A-05/A-07 request halves; ledger: forgot-password/route.test.ts, magic-link/route.test.ts).

const MAGIC = ['ok' => true, 'message' => 'If that account exists, a sign-in link has been sent.'];
const FORGOT = ['ok' => true, 'message' => 'If that account exists, a password recovery email has been sent.'];

beforeEach(function () {
    config(['portal.public_site_url' => 'https://app.example.com', 'portal.auth_client_ip_header' => 'cf-connecting-ip']);
    ProbeTransport::install();
});

function postAuth(string $path, array $body, string $origin = 'https://app.example.com', string $address = '203.0.113.7')
{
    return test()->withHeaders(['Origin' => $origin, 'Cf-Connecting-Ip' => $address])->postJson($path, $body);
}

it('answers the same bytes for a known account, an unknown one and a failed delivery', function (string $path, array $expected) {
    $user = User::factory()->create(['email' => 'ada@example.test']);

    $known = postAuth($path, ['email' => ' Ada@Example.TEST ']);
    $unknown = postAuth($path, ['email' => 'nobody@example.test']);
    ProbeTransport::install(fn () => throw new RuntimeException('boom'));
    $failed = postAuth($path, ['email' => 'ada@example.test'], address: '203.0.113.8');

    $known->assertOk()->assertExactJson($expected);
    expect($unknown->getContent())->toBe($known->getContent())->and($failed->getContent())->toBe($known->getContent())
        ->and($user->fresh())->not->toBeNull();
})->with([['/api/auth/magic-link', MAGIC], ['/api/auth/forgot-password', FORGOT]]);

it('sends exactly one email to an existing account and none to an unknown one', function (string $path) {
    User::factory()->create(['email' => 'ada@example.test']);

    postAuth($path, ['email' => 'ada@example.test', 'next' => '/projects'])->assertOk();
    postAuth($path, ['email' => 'nobody@example.test'], address: '203.0.113.8')->assertOk();

    expect(ProbeTransport::$sent)->toHaveCount(1)->and(DB::table('auth_proofs')->count())->toBe(1)
        ->and(DB::table('users')->where('email', 'nobody@example.test')->exists())->toBeFalse();
})->with(['/api/auth/magic-link', '/api/auth/forgot-password']);

it('uses the right link and subject for each endpoint', function () {
    User::factory()->create(['email' => 'ada@example.test']);

    postAuth('/api/auth/magic-link', ['email' => 'ada@example.test'])->assertOk();
    postAuth('/api/auth/forgot-password', ['email' => 'ada@example.test'], address: '203.0.113.8')->assertOk();

    expect(ProbeTransport::$sent[0]->getSubject())->toBe('Your Logo Fountain sign-in link')
        ->and(ProbeTransport::$sent[0]->getTextBody())->toContain('https://app.example.com/auth/callback#token=')
        ->and(ProbeTransport::$sent[1]->getSubject())->toBe('Reset your Logo Fountain password')
        ->and(ProbeTransport::$sent[1]->getTextBody())->toContain('https://app.example.com/reset-password#token=');
});

it('skips work for an email without @, but still answers 200 on magic-link', function () {
    postAuth('/api/auth/magic-link', ['email' => 'nope'])->assertOk()->assertExactJson(MAGIC);
    postAuth('/api/auth/magic-link', ['next' => '/x'])->assertOk()->assertExactJson(MAGIC);

    expect(ProbeTransport::$sent)->toBe([])->and(DB::table('auth_rate_limits')->count())->toBe(0);
});

it('rejects an empty or @-less email on forgot-password with 400 INVALID_EMAIL', function (array $body) {
    postAuth('/api/auth/forgot-password', $body)->assertStatus(400)
        ->assertExactJson(['error' => ['code' => 'INVALID_EMAIL', 'message' => 'Enter a valid email address.']]);
})->with([[['next' => 1]], [['email' => '']], [['email' => '   ']], [['email' => 'nope']], [['email' => 5]]]);

it('sends nothing when the limit denies, and still answers 200', function (string $path, array $expected) {
    User::factory()->create(['email' => 'ada@example.test']);
    foreach (range(1, 5) as $_) {
        postAuth($path, ['email' => 'ada@example.test'])->assertOk();
    }
    $sent = count(ProbeTransport::$sent);

    postAuth($path, ['email' => 'ada@example.test'])->assertOk()->assertExactJson($expected);

    expect($sent)->toBe(5)->and(ProbeTransport::$sent)->toHaveCount(5);
})->with([['/api/auth/magic-link', MAGIC], ['/api/auth/forgot-password', FORGOT]]);

it('runs the origin guard before any work', function (string $path) {
    User::factory()->create(['email' => 'ada@example.test']);

    postAuth($path, ['email' => 'ada@example.test'], 'https://evil.example')->assertForbidden();

    expect(ProbeTransport::$sent)->toBe([]);
})->with(['/api/auth/magic-link', '/api/auth/forgot-password']);

it('Q2: queues the email for a known account and for an unknown one alike; the response never waits on a send', function (string $path, array $expected) {
    Queue::fake();
    User::factory()->create(['email' => 'ada@example.test']);

    $known = postAuth($path, ['email' => 'ada@example.test']);
    $unknown = postAuth($path, ['email' => 'nobody@example.test'], address: '203.0.113.8');

    expect($unknown->getContent())->toBe($known->getContent())->and($unknown->getStatusCode())->toBe($known->getStatusCode())
        ->and($unknown->headers->get('content-type'))->toBe($known->headers->get('content-type'));
    $known->assertOk()->assertExactJson($expected);
    Queue::assertPushed(SendAuthLinkMail::class, 2); // one job per request, whichever the account
    expect(ProbeTransport::$sent)->toBe([])->and(DB::table('auth_proofs')->count())->toBe(0); // nothing sent or issued in the request
})->with([['/api/auth/magic-link', MAGIC], ['/api/auth/forgot-password', FORGOT]]);

it('Q2: the queued job sends one email for a known account and nothing for an unknown one', function () {
    $user = User::factory()->create(['email' => 'ada@example.test']);

    (new SendAuthLinkMail(null, 'magic', '/dashboard'))->handle(app(SendAuthLink::class));
    expect(ProbeTransport::$sent)->toBe([])->and(DB::table('auth_proofs')->count())->toBe(0);

    (new SendAuthLinkMail($user->id, 'magic', '/dashboard'))->handle(app(SendAuthLink::class));
    expect(ProbeTransport::$sent)->toHaveCount(1)->and(DB::table('auth_proofs')->count())->toBe(1);
});

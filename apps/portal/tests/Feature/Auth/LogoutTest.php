<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Tests\Support\SessionRows;

// Story 4.7 AC 1, 2, 9 (A-02; ledger logout/route.test.ts).

beforeEach(function () {
    config(['session.driver' => 'database', 'portal.public_site_url' => 'https://app.example.com']);
});

function postLogout(?string $sessionId, string $origin = 'https://app.example.com'): TestResponse
{
    $t = test()->withHeaders(['Origin' => $origin]);
    if ($sessionId !== null) {
        $t = $t->withCredentials()->withCookie(config('session.cookie'), $sessionId);
    }

    return $t->postJson('/api/auth/logout');
}

it('signs out: ok, a clearing cookie, the row gone and the session endpoint anonymous', function () {
    $user = User::factory()->create();
    $id = str_repeat('a', 40);
    SessionRows::insert($id, $user->id, time(), time(), true);

    $r = postLogout($id);

    $r->assertOk()->assertExactJson(['ok' => true]);
    $cookie = collect($r->baseResponse->headers->getCookies())->first(fn ($c) => $c->getName() === config('session.cookie'));
    expect($cookie)->not->toBeNull()->and($cookie->getExpiresTime())->toBeLessThan(time())
        ->and($r->headers->get('Cache-Control'))->toBe('no-store')
        ->and(DB::table('sessions')->where('id', $id)->exists())->toBeFalse();
    test()->withCredentials()->withCookie(config('session.cookie'), $id)->getJson('/api/auth/session')
        ->assertOk()->assertExactJson(['authenticated' => false]);
});

it('answers ok with no session at all', function () {
    postLogout(null)->assertOk()->assertExactJson(['ok' => true]);
});

it('refuses an untrusted origin before anything else', function () {
    $user = User::factory()->create();
    $id = str_repeat('b', 40);
    SessionRows::insert($id, $user->id, time(), time(), true);

    postLogout($id, 'https://evil.example')->assertStatus(403);

    expect(DB::table('sessions')->where('id', $id)->exists())->toBeTrue();
});

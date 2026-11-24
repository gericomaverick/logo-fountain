<?php

use App\Models\Profile;
use Illuminate\Support\Facades\DB;
use Tests\Support\SessionRows;
use Tests\Support\TruncatesDatabaseAsOwner;

uses(TruncatesDatabaseAsOwner::class);

// Story 6.12 (C-17, DV-3): `GET/PUT /api/profile`. Compared with the Next `profile/route.test.ts` (4 cases:
// stored profile, email fallback with no profile, PUT trims and preserves omitted fields, invalid JSON / non-string names).

const PF_ORIGIN = 'https://portal.example.test';

beforeEach(function () {
    config(['session.driver' => 'database', 'portal.public_site_url' => PF_ORIGIN]);
});

afterEach(fn () => DB::disconnect());

function pfSignIn($user, bool $origin = true): void
{
    $sid = substr(hash('sha256', $user->id.microtime()), 0, 40);
    SessionRows::insert($sid, $user->id, time(), time(), true);
    test()->flushSession();
    test()->withCredentials()->withCookie(config('session.cookie'), $sid);
    if ($origin) {
        test()->withHeaders(['Origin' => PF_ORIGIN]);
    }
}

function pfPut(array|string $body)
{
    return is_array($body) ? test()->putJson('/api/profile', $body)
        : test()->call('PUT', '/api/profile', [], (fn () => $this->prepareCookiesForRequest())->call(test()), [], ['CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json', 'HTTP_ORIGIN' => PF_ORIGIN], $body);
}

function pfUser(array $attrs = [])
{
    return Profile::factory()->create($attrs + ['first_name' => 'Ada', 'last_name' => 'Lovelace', 'full_name' => 'Ada Lovelace'])->user;
}

it('GET returns the stored profile', function () {
    $user = pfUser();
    pfSignIn($user);
    $this->getJson('/api/profile')->assertOk()->assertExactJson(['profile' => [
        'id' => $user->id, 'email' => $user->email, 'firstName' => 'Ada', 'lastName' => 'Lovelace', 'fullName' => 'Ada Lovelace',
    ]]);
})->group('settings', 'api');

it('GET falls back to the login email when there is no profile row', function () {
    $user = pfUser();
    DB::connection('pgsql_migrate')->table('profiles')->where('id', $user->id)->delete();
    pfSignIn($user);
    $this->getJson('/api/profile')->assertOk()->assertExactJson(['profile' => [
        'id' => $user->id, 'email' => $user->email, 'firstName' => null, 'lastName' => null, 'fullName' => null,
    ]]);
})->group('settings', 'api');

it('PUT trims, keeps omitted fields, maps blank to null, recomputes fullName and persists', function () {
    $user = pfUser();
    pfSignIn($user);
    pfPut(['firstName' => '  Grace  '])->assertOk()->assertJsonPath('profile.firstName', 'Grace')->assertJsonPath('profile.lastName', 'Lovelace')->assertJsonPath('profile.fullName', 'Grace Lovelace');
    pfPut(['lastName' => null])->assertOk()->assertJsonPath('profile.lastName', null)->assertJsonPath('profile.fullName', 'Grace');
    pfPut(['firstName' => " \u{00A0}\u{3000} ", 'lastName' => 'x'])->assertOk()->assertJsonPath('profile.firstName', null)->assertJsonPath('profile.fullName', 'x');
    pfPut([])->assertOk()->assertJsonPath('profile.lastName', 'x');
    expect(Profile::query()->find($user->id)->only(['first_name', 'last_name', 'full_name']))->toBe(['first_name' => null, 'last_name' => 'x', 'full_name' => 'x']);
    $this->getJson('/api/profile')->assertJsonPath('profile.fullName', 'x');
})->group('settings', 'api');

it('PUT cuts a name to 80 UTF-16 units (an astral character counts 2) and ignores unknown keys (DV-3, no VAT)', function () {
    $user = pfUser();
    pfSignIn($user);
    pfPut(['lastName' => str_repeat('y', 90), 'vatNumber' => 'GB123456789'])->assertOk()
        ->assertJsonPath('profile.lastName', str_repeat('y', 80))->assertJsonMissingPath('profile.vatNumber');
    pfPut(['firstName' => str_repeat('😀', 40).'zz'])->assertOk()->assertJsonPath('profile.firstName', str_repeat('😀', 40));
    $this->getJson('/api/profile')->assertOk();
})->group('settings', 'api');

it('PUT keeps a request with a lone surrogate (Next accepts it; the stored value carries U+FFFD)', function () {
    $user = pfUser();
    pfSignIn($user);
    pfPut('{"firstName":"A\\ud800B"}')->assertOk()->assertJsonPath('profile.firstName', "A\u{FFFD}B");
    expect(Profile::query()->find($user->id)->first_name)->toBe("A\u{FFFD}B");
    // a cut at 80 units that splits an astral pair leaves a lone high surrogate
    pfPut(['firstName' => str_repeat('y', 79).'😀'])->assertOk()->assertJsonPath('profile.firstName', str_repeat('y', 79)."\u{FFFD}");
})->group('settings', 'api');

it('PUT rejects non-string names and bad JSON, and writes nothing', function () {
    $user = pfUser();
    pfSignIn($user);
    pfPut(['firstName' => 5])->assertStatus(400)->assertJsonPath('error.code', 'INVALID_FIRST_NAME');
    pfPut(['lastName' => true])->assertStatus(400)->assertJsonPath('error.code', 'INVALID_LAST_NAME');
    pfPut(['firstName' => 'Ok', 'lastName' => ['x']])->assertStatus(400)->assertJsonPath('error.code', 'INVALID_LAST_NAME');
    pfPut('{oops')->assertStatus(400)->assertJsonPath('error.code', 'INVALID_JSON');
    pfPut('')->assertStatus(400)->assertJsonPath('error.code', 'INVALID_JSON');
    expect(Profile::query()->find($user->id)->first_name)->toBe('Ada');
})->group('settings', 'api');

it('is per caller: PUT changes only the signed-in user (no id in the request to forge)', function () {
    $mine = pfUser();
    $other = pfUser(['first_name' => 'Bob', 'full_name' => 'Bob Lovelace']);
    pfSignIn($mine);
    pfPut(['id' => $other->id, 'email' => 'x@example.test', 'isAdmin' => true, 'firstName' => 'Mine'])->assertOk()
        ->assertJsonPath('profile.id', $mine->id)->assertJsonPath('profile.email', $mine->email);
    expect(Profile::query()->find($other->id)->first_name)->toBe('Bob')
        ->and(Profile::query()->find($mine->id)->is_admin)->toBeFalse();
})->group('settings', 'api', 'authz');

it('requires a session (401) and a trusted Origin on PUT', function () {
    $this->getJson('/api/profile')->assertStatus(401)->assertJsonPath('error.code', 'UNAUTHORIZED');
    $this->withHeaders(['Origin' => PF_ORIGIN])->putJson('/api/profile', ['firstName' => 'X'])->assertStatus(401);
    $user = pfUser();
    pfSignIn($user, false);
    $this->withHeaders(['Origin' => 'https://evil.example'])->putJson('/api/profile', ['firstName' => 'X'])->assertStatus(403);
    expect(Profile::query()->find($user->id)->first_name)->toBe('Ada');
})->group('settings', 'api', 'authz');

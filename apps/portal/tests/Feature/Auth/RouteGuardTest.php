<?php

use App\Models\Profile;
use App\Models\User;
use App\Support\DatabaseRoles;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Tests\Support\SessionRows;

// Story 4.8 AC 5-7 (A-16, A-04): `auth.verified` and `admin`, decided from the database on every request.

const GUARD_SID = 'zbcdefghijabcdefghijabcdefghijabcdefghij';

beforeEach(function () {
    config(['session.driver' => 'database', 'session.lifetime' => 10080]);
    Carbon::setTestNow('2026-11-22 12:00:00');
    Route::middleware(['web', 'admin'])->get('/api/_guard/admin', fn () => response()->json(['ok' => true]));
    Route::middleware(['web', 'admin'])->get('/_guard/admin-page', fn () => 'admin page');
    Route::middleware(['web', 'auth.verified'])->get('/api/_guard/user', fn () => response()->json(['ok' => true]));
});

afterEach(fn () => Carbon::setTestNow());

function guardAs(User $user): void
{
    SessionRows::insert(GUARD_SID, $user->id, now()->getTimestamp() - 60, now()->getTimestamp());
    test()->withCredentials()->withCookie(config('session.cookie'), GUARD_SID);
}

it('sends the root to /login', function () {
    $this->get('/')->assertRedirect('/login');
});

it('redirects an anonymous page request to /login with a safe next', function () {
    $this->get('/dashboard')->assertRedirect('/login?next=%2Fdashboard');
    $this->get('/_guard/admin-page?tab=a')->assertRedirect('/login?next=%2F_guard%2Fadmin-page%3Ftab%3Da');
});

it('lets a signed-in user reach the dashboard placeholder', function () {
    guardAs(Profile::factory()->create()->user);
    $this->get('/dashboard')->assertOk();
});

it('sends a signed-in visitor to /login on to /dashboard, or to a safe next', function () {
    guardAs(Profile::factory()->create()->user);
    $this->get('/login')->assertRedirect('/dashboard');
    $this->get('/login?next=%2Fprojects%2F1')->assertRedirect('/projects/1');
    $this->get('/login?next=%2F%2Fevil.example')->assertRedirect('/dashboard');
});

it('shows /login to an anonymous visitor', function () {
    $this->get('/login')->assertOk();
});

it('answers an anonymous API request 401 UNAUTHORIZED with nextStep', function () {
    $this->getJson('/api/_guard/user')->assertStatus(401)->assertExactJson(
        ['error' => ['message' => 'Unauthorized', 'code' => 'UNAUTHORIZED', 'details' => ['nextStep' => 'Sign in and retry.']]]
    );
    $this->getJson('/api/_guard/admin')->assertStatus(401)->assertJsonPath('error.code', 'UNAUTHORIZED');
});

it('answers a non-admin 403 FORBIDDEN with nextStep', function () {
    guardAs(Profile::factory()->create()->user);
    $this->getJson('/api/_guard/admin')->assertStatus(403)->assertExactJson(
        ['error' => ['message' => 'Forbidden', 'code' => 'FORBIDDEN', 'details' => ['nextStep' => 'Use an admin account.']]]
    );
    $this->get('/_guard/admin-page')->assertForbidden();
});

it('admits an admin', function () {
    $profile = Profile::factory()->admin()->create();
    guardAs($profile->user);
    $this->getJson('/api/_guard/admin')->assertOk();
});

it('reads the role from the database on each request', function () {
    $profile = Profile::factory()->admin()->create();
    guardAs($profile->user);
    $this->getJson('/api/_guard/admin')->assertOk();

    DB::connection(DatabaseRoles::MIGRATE)->table('profiles')->where('id', $profile->id)->update(['is_admin' => false]);
    $this->getJson('/api/_guard/admin')->assertStatus(403);
});

it('treats an admin with an unverified mailbox as nobody', function () {
    $profile = Profile::factory()->admin()->create();
    guardAs($profile->user);
    DB::table('users')->where('id', $profile->id)->update(['email_verified_at' => null]);
    $this->getJson('/api/_guard/admin')->assertStatus(401);
});

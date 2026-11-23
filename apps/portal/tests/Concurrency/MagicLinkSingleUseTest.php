<?php

use App\Models\User;
use App\Support\Auth\AuthProofs;
use App\Support\DatabaseRoles;
use Illuminate\Support\Facades\DB;
use Tests\Support\RaceChildren;

// Story 4.5 AC 4 (A-05, ledger #66 case 3; Next integration.test.ts:79): ten parallel confirms, one winner.

afterEach(function () {
    DB::disconnect(DatabaseRoles::RUNTIME);
    DB::disconnect(DatabaseRoles::MIGRATE);
});

it('lets exactly one of ten parallel confirms of the same token win', function () {
    $user = User::factory()->create(['email_verified_at' => null, 'password' => null]);
    $token = AuthProofs::issue($user, 'magic');

    $results = RaceChildren::run('confirm', 10, [$token]);

    expect(count(array_filter($results, fn (array $r) => $r['won'])))->toBe(1)
        ->and(DB::table('auth_proofs')->where('user_id', $user->id)->count())->toBe(0)
        ->and(DB::table('users')->where('id', $user->id)->value('email_verified_at'))->not->toBeNull();
})->group('pg-race');

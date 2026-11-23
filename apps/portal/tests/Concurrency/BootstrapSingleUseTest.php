<?php

use App\Models\Profile;
use App\Support\DatabaseRoles;
use Illuminate\Support\Facades\DB;
use Tests\Support\RaceChildren;

// Story 4.9a (A-12; Next scripts/bootstrap-admin.mjs): two operators' grants at once, one wins, the other is refused
// with the message (not a QueryException: a child that throws fails RaceChildren). Marker, admin flag and audit row stay single.

afterEach(function () {
    DB::disconnect(DatabaseRoles::RUNTIME);
    DB::disconnect(DatabaseRoles::MIGRATE);
});

it('lets exactly one of two concurrent bootstrap grants win and refuses the other cleanly', function () {
    $a = Profile::factory()->create()->user;
    $b = Profile::factory()->create()->user;

    $results = RaceChildren::runMixed([
        ['bootstrap', [$a->email, $a->id]],
        ['bootstrap', [$b->email, $b->id]],
    ]);

    $winners = array_values(array_filter($results, fn (array $r) => $r['won']));
    $losers = array_values(array_filter($results, fn (array $r) => ! $r['won']));
    expect($winners)->toHaveCount(1)->and($losers)->toHaveCount(1)
        ->and($losers[0]['output'])->toMatch('/already consumed|admin already exists/')
        ->and(DB::connection(DatabaseRoles::MIGRATE)->table('auth_admin_bootstrap')->count())->toBe(1)
        ->and(DB::connection(DatabaseRoles::MIGRATE)->table('profiles')->where('is_admin', true)->count())->toBe(1)
        ->and(DB::connection(DatabaseRoles::MIGRATE)->table('audit_events')->where('type', 'admin.bootstrapped')->count())->toBe(1);
})->group('pg-race');

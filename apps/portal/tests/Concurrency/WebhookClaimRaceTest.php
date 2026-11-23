<?php

use App\Support\DatabaseRoles;
use Illuminate\Support\Facades\DB;
use Tests\Support\RaceChildren;

// Story 5.2 AC 6 (K-05, ADR-014): ten parallel deliveries of one event, one claim.

afterEach(function () {
    DB::disconnect(DatabaseRoles::RUNTIME);
    DB::disconnect(DatabaseRoles::MIGRATE);
});

it('lets exactly one of ten parallel deliveries claim the event', function () {
    $results = RaceChildren::run('webhook-claim', 10, ['evt_race_1']);

    expect(count(array_filter($results, fn (array $r) => $r['won'])))->toBe(1)
        ->and(DB::table('stripe_events')->where('event_id', 'evt_race_1')->count())->toBe(1);
})->group('pg-race');

<?php

use App\Support\RateLimits;
use Illuminate\Support\Facades\DB;
use Tests\Support\RateLimitBuckets as Buckets;

// Story 2.5 critic point 1 (@pg-race): another process's cleanup (a later clock, so it takes rows this
// request's own cleanup spared) must never turn a checkout send into an exception or a deadlock.
// Deterministic: a query listener runs the foreign cleanup (committed, on the owner connection) right after
// each statement the limits connection executes, which is exactly the gap the old two-statement
// insert-then-lock left open.

it('checkout mode: a foreign cleanup between statements gives allowed, never an exception or a hang', function () {
    $old = now()->toImmutable()->subSeconds(3599); // survives this request's one-hour cleanup, not a later one
    Buckets::seed('checkout:session:cs_edge', 1, $old);
    Buckets::seed('checkout:destination:edge@example.com', 1, $old);

    DB::connection('pgsql_limits')->statement("SET lock_timeout = '5s'"); // a deadlock/hang fails fast, not forever

    $foreignRuns = 0;
    $statements = 0;
    $inListener = false;
    DB::connection('pgsql_limits')->listen(function () use (&$foreignRuns, &$statements, &$inListener) {
        // Skip the first statement (this request's own cleanup): the foreign one lands after it, mid-transaction.
        if ($inListener || ++$statements === 1) {
            return;
        }
        $inListener = true;
        // As another process's prune would, but skipping rows a transaction holds (it must not wait here).
        DB::connection('pgsql_migrate')->statement(
            "DELETE FROM auth_rate_limits WHERE key IN (SELECT key FROM auth_rate_limits WHERE window_start < now() - interval '3000 seconds' FOR UPDATE SKIP LOCKED)"
        );
        $foreignRuns++;
        $inListener = false;
    });

    $result = RateLimits::consumeCheckoutEmail('cs_edge', 'edge@example.com');

    expect($result->allowed)->toBeTrue()
        ->and($foreignRuns)->toBeGreaterThan(0)
        ->and(Buckets::hits('checkout:session:cs_edge'))->toBe(1)
        ->and(Buckets::hits('checkout:destination:edge@example.com'))->toBe(1);
});

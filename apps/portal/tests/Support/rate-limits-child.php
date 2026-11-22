<?php

// Story 2.5 (NFR-S4): one separate PHP process (own connections) for tests/Concurrency/RateLimitsRaceTest.php.
// Usage: php rate-limits-child.php <barrier key> <RateLimits method> <JSON argument list>. It boots the app,
// connects, waits on a shared advisory lock the parent holds (so every child starts together), makes one call
// and prints {"allowed": bool, "retryAfterSeconds": int|null}.

use App\Support\RateLimits;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

[, $barrier, $method, $json] = $argv;
/** @var list<string|null> $arguments */
$arguments = json_decode($json, true, flags: JSON_THROW_ON_ERROR);

DB::connection('pgsql_limits')->getPdo();
DB::connection('pgsql')->select('SELECT pg_advisory_lock_shared(?)', [(int) $barrier]);
DB::connection('pgsql')->select('SELECT pg_advisory_unlock_shared(?)', [(int) $barrier]);

$result = RateLimits::{$method}(...$arguments);

echo json_encode(['allowed' => $result->allowed, 'retryAfterSeconds' => $result->retryAfterSeconds], JSON_THROW_ON_ERROR);

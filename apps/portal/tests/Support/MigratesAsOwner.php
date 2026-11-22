<?php

namespace Tests\Support;

use App\Support\DatabaseRoles;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Foundation\Testing\RefreshDatabaseState;
use RuntimeException;

/**
 * Story 2.1 AC 8 (ADR-013): the test database is built the way production is, once per test process and
 * before any test: `migrate:fresh` as the schema owner (`pgsql_migrate`), then `db:grants`. Never migrate
 * on the default (runtime) connection, in tests too: the runtime role cannot run DDL.
 */
trait MigratesAsOwner
{
    protected function migrateAsOwnerOnce(): void
    {
        if (RefreshDatabaseState::$migrated) {
            return;
        }
        $kernel = $this->app[Kernel::class];
        foreach (['migrate:fresh' => ['--database' => DatabaseRoles::MIGRATE, '--force' => true], 'db:grants' => []] as $command => $arguments) {
            if ($kernel->call($command, $arguments) !== 0) {
                throw new RuntimeException($command.' failed in the test harness: '.$kernel->output());
            }
        }
        $kernel->setArtisan(null);
        RefreshDatabaseState::$migrated = true;
    }
}

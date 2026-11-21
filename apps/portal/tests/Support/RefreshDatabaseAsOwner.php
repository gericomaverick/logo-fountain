<?php

namespace Tests\Support;

use App\Support\DatabaseRoles;
use Illuminate\Foundation\Testing\RefreshDatabase;

/**
 * Story 2.1 (ADR-013): RefreshDatabase that migrates as the schema owner and applies db:grants (MigratesAsOwner),
 * then wraps each test in a transaction on the runtime connection only. Rows written through pgsql_migrate or
 * pgsql_limits are committed and not rolled back, and a runtime row is invisible to them: write test data
 * through the runtime connection, or use the Concurrency harness.
 */
trait RefreshDatabaseAsOwner
{
    use MigratesAsOwner, RefreshDatabase;

    /** @var list<string> */
    protected $connectionsToTransact = [DatabaseRoles::RUNTIME];

    protected function migrateDatabases(): void
    {
        $this->migrateAsOwnerOnce();
    }

    protected function migrateDatabasesWithoutEvents(): void
    {
        $this->migrateAsOwnerOnce();
    }
}

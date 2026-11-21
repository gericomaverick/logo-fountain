<?php

namespace Tests\Support;

use App\Support\DatabaseRoles;
use Illuminate\Foundation\Testing\DatabaseTruncation;

/**
 * Story 2.1: the harness for tests/Concurrency. No transaction wrapper (other connections and processes must
 * see committed rows): migrate as the owner + db:grants once (MigratesAsOwner), then truncate every table
 * except `migrations` through pgsql_migrate before each test.
 */
trait TruncatesDatabaseAsOwner
{
    use DatabaseTruncation, MigratesAsOwner;

    /** @var list<string> */
    protected $connectionsToTruncate = [DatabaseRoles::MIGRATE];

    protected function beforeTruncatingDatabase(): void
    {
        $this->migrateAsOwnerOnce();
    }
}

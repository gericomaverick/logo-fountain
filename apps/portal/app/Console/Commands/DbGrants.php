<?php

namespace App\Console\Commands;

use App\Support\DatabaseRoles;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * O-06 / ADR-013: apply ops/postgres/runtime-grants.sql as the schema owner. Run after every
 * `migrate --database=pgsql_migrate` (dev init, the test harness and, from Epic 9, the deploy script).
 * The runtime role is the `pgsql` connection's username, inserted as a quoted identifier.
 */
final class DbGrants extends Command
{
    protected $signature = 'db:grants {--database='.DatabaseRoles::MIGRATE.' : Must be the migrate connection}';

    protected $description = 'Grant the runtime role DML only, and revoke it from migrations and operator tables';

    public function handle(): int
    {
        if ($this->option('database') !== DatabaseRoles::MIGRATE) {
            $this->error('db:grants runs only on the '.DatabaseRoles::MIGRATE.' connection (ADR-013)');

            return self::FAILURE;
        }

        $migrate = DB::connection(DatabaseRoles::MIGRATE);
        $runtime = DB::connection(DatabaseRoles::RUNTIME)->getConfig('username');
        if (! is_string($runtime) || $runtime === '' || $runtime === $migrate->getConfig('username')) {
            $this->error('db:grants needs a runtime role distinct from the migrate role (ADR-013)');

            return self::FAILURE;
        }

        $template = (string) file_get_contents(base_path('ops/postgres/runtime-grants.sql'));
        $sql = str_replace('{{runtime_role}}', '"'.str_replace('"', '""', $runtime).'"', $template);
        // The role is a config value, not a literal, so the SQL goes to PDO directly (one transaction).
        $migrate->transaction(fn () => $migrate->getPdo()->exec($sql));

        $this->info('Runtime grants applied to role '.$runtime.'.');

        return self::SUCCESS;
    }
}

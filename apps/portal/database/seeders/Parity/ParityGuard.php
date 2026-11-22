<?php

namespace Database\Seeders\Parity;

use App\Support\DatabaseRoles;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;

/**
 * Story 2.6 AC 2: the fail-closed guard of `parity:seed`, the 0.4 rules (parity-seed-guard.mjs) adapted. Checked in
 * this order, before any write. Next's database-name rule (lf_parity) has no Laravel equivalent: the Laravel parity
 * database is `portal`, like the dev database, so the marker table is what tells them apart.
 */
final class ParityGuard
{
    /** parity-seed-guard.mjs:3. */
    private const LOCAL_HOSTS = ['127.0.0.1', 'localhost', 'postgres', '::1', '[::1]'];

    /** PARITY_MODE, APP_ENV and the migrate connection's host: config only, no connection opened. */
    public function assertTarget(): void
    {
        if (! Config::boolean('parity.mode')) {
            throw new ParitySeedError('parity seed refused: PARITY_MODE=1 is required');
        }
        if (Config::string('app.env') === 'production') {
            throw new ParitySeedError('parity seed refused: APP_ENV=production');
        }
        $host = $this->migrateHost();
        if (! in_array($host, self::LOCAL_HOSTS, true)) {
            throw new ParitySeedError("parity seed refused: host {$host} of the ".DatabaseRoles::MIGRATE.' connection is not a local parity host');
        }
    }

    /** parity-seed-guard.mjs:19-22, on the connection the seed writes through. */
    public function assertMarker(): void
    {
        $present = DB::connection(DatabaseRoles::MIGRATE)->scalar("SELECT to_regclass('parity.parity_marker') IS NOT NULL");
        if ($present !== true) {
            throw new ParitySeedError('parity seed refused: table parity.parity_marker is missing (not a parity database)');
        }
    }

    /** The host the connection really uses: a DB_MIGRATE_URL wins over DB_HOST, as in Laravel's connection factory. */
    private function migrateHost(): string
    {
        $config = Config::array('database.connections.'.DatabaseRoles::MIGRATE);
        $url = $config['url'] ?? null;
        if (is_string($url) && $url !== '') {
            $host = parse_url($url, PHP_URL_HOST);

            return is_string($host) ? $host : '';
        }
        $host = $config['host'] ?? null;

        return is_string($host) ? $host : '';
    }
}

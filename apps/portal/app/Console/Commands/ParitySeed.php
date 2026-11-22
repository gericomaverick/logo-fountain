<?php

namespace App\Console\Commands;

use Database\Seeders\Parity\ParitySeeder;
use Database\Seeders\Parity\ParitySeedError;
use Illuminate\Console\Command;

/**
 * Story 2.6 (O-02): reset the parity database and load one scenario of tests/parity/fixtures/scenarios, the Laravel
 * half of apps/web/scripts/parity-seed.mjs. Test tooling only: guarded (Database\Seeders\Parity\ParityGuard), so a
 * refusal or a bad scenario exits 1 before anything is written. The parity suite runs it inside the portal container:
 * `docker compose … exec -T -e PARITY_MODE=1 app php artisan parity:seed <scenario>` (tests/parity/adapters/seed.ts).
 */
final class ParitySeed extends Command
{
    protected $signature = 'parity:seed {scenario : A file name in tests/parity/fixtures/scenarios, without .json}';

    protected $description = 'Reset the parity database and load one parity scenario (PARITY_MODE=1 only)';

    public function handle(ParitySeeder $seeder): int
    {
        try {
            $scenario = $seeder->seed($this->argument('scenario'));
        } catch (ParitySeedError $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }
        $this->info(sprintf('parity seed: loaded "%s" (%d users, %d projects, 0 objects)', $scenario->name, count($scenario->users), count($scenario->projects)));

        return self::SUCCESS;
    }
}

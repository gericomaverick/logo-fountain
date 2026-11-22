<?php

namespace Tests\Support;

use App\Support\DatabaseRoles;
use Database\Seeders\Parity\Scenario;
use Database\Seeders\Parity\ScenarioId;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Process;
use RuntimeException;

/**
 * Story 2.6 (AC 4, 6): the seed facts both ways. `actual()` runs the shared tests/parity/fixtures/seed-facts SQL
 * (Laravel wrapper + body) with psql against the test database, as the owner; `expected()` computes the same
 * lines from the scenario JSON alone, so the Laravel gate doesn't depend on Next. Plus the parity marker the
 * guard looks for, created and dropped per test in portal_test (the truncation harness only sees `public`).
 */
final class ParityFacts
{
    public static function createMarker(): void
    {
        DB::connection(DatabaseRoles::MIGRATE)->unprepared(<<<'SQL'
            CREATE SCHEMA IF NOT EXISTS parity;
            CREATE TABLE IF NOT EXISTS parity.parity_marker (id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1), purpose text NOT NULL);
            INSERT INTO parity.parity_marker (purpose) VALUES ('Pest: story 2.6') ON CONFLICT DO NOTHING;
            SQL);
    }

    public static function dropMarker(): void
    {
        DB::connection(DatabaseRoles::MIGRATE)->unprepared('DROP SCHEMA IF EXISTS parity CASCADE');
    }

    /** @return list<string> */
    public static function actual(): array
    {
        $dir = Config::string('parity.seed_facts_dir');
        foreach (['seed-facts-laravel.sql', 'seed-facts.sql'] as $file) {
            if (! is_file("{$dir}/{$file}")) {
                throw new RuntimeException("{$dir}/{$file} is missing: mount tests/parity/fixtures/seed-facts there (compose.yaml, x-php volumes)");
            }
        }
        $c = Config::array('database.connections.'.DatabaseRoles::MIGRATE);
        $arg = static fn (string $key): string => is_scalar($c[$key] ?? null) ? (string) $c[$key] : '';
        $result = Process::env(['PGPASSWORD' => $arg('password')])->run([
            'psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1',
            '-h', $arg('host'), '-p', $arg('port'), '-U', $arg('username'), '-d', $arg('database'),
            '-f', "{$dir}/seed-facts-laravel.sql", '-f', "{$dir}/seed-facts.sql",
        ]);
        if (! $result->successful()) {
            throw new RuntimeException('seed-facts SQL failed: '.$result->errorOutput());
        }

        return array_values(array_filter(explode("\n", $result->output()), static fn (string $l): bool => $l !== ''));
    }

    /** @return list<string> the lines seed-facts.sql prints for this scenario, in its order */
    public static function expected(Scenario $s): array
    {
        $id = static fn (string $kind, string $key): string => ScenarioId::for($s->name, $kind, $key);
        $admin = $s->firstAdmin();
        $adminId = $admin === null ? null : $id('user', $admin->key);
        $count = static fn (callable $keep, array $items): string => (string) count(array_filter($items, $keep));
        $sorted = static function (array $items): array {
            usort($items, strcmp(...));

            return $items;
        };

        /** @var list<array{int, string, string}> $facts */
        $facts = [
            [1, 'users', (string) count($s->users)],
            [2, 'users.verified', $count(static fn ($u): bool => $u->emailVerified, $s->users)],
            [3, 'users.password', $count(static fn ($u): bool => $u->password !== null, $s->users)],
            [4, 'profiles', (string) count($s->users)],
            [5, 'profiles.admin', $count(static fn ($u): bool => $u->admin, $s->users)],
            [6, 'admin_bootstrap', $adminId ?? 'none'],
        ];
        $statuses = array_count_values(array_map(static fn ($p): string => $p->status, $s->projects));
        foreach ($statuses as $status => $n) {
            $facts[] = [7, "projects.status:{$status}", (string) $n];
        }
        foreach ($s->projects as $p) {
            $at = 'project:'.$id('project', $p->key).':';
            $facts[] = [8, $at.'memberships', implode(',', $sorted(array_map(static fn (string $m): string => $id('user', $m), $p->members)))];
            $chain = [];
            $previous = null;
            foreach ($p->stateHistory as $state) {
                $actor = $previous === null || $adminId === null ? '' : "@{$adminId}";
                $chain[] = ($previous ?? '-').">{$state}{$actor}";
                $previous = $state;
            }
            $facts[] = [8, $at.'state_changed', $chain === [] ? 'none' : implode(',', $chain)];
            foreach ($p->entitlements as $key => [$limit, $consumed, $reserved]) {
                $facts[] = [8, $at."entitlement:{$key}", ($limit === null ? 'null' : (string) $limit).",{$consumed},{$reserved}"];
            }
            $facts[] = [8, $at.'orders', "{$p->orderStatus}:{$p->orderTotalCents}"];
            $facts[] = [8, $at.'briefs', $p->briefAnswers === null ? '0' : '1'];
            $facts[] = [8, $at.'brief_drafts', $p->briefDraftAnswers === null ? '0' : '1'];
            $concepts = $p->concepts;
            usort($concepts, static fn (array $a, array $b): int => $a['number'] <=> $b['number']);
            $facts[] = [8, $at.'concepts', $concepts === [] ? 'none' : implode(',', array_map(static fn (array $c): string => "{$c['number']}:{$c['status']}", $concepts))];
            $assets = array_merge(array_fill(0, count($p->concepts), 'concept'), $p->finalZip ? ['final_zip'] : []);
            $facts[] = [8, $at.'file_assets', $assets === [] ? 'none' : implode(',', $sorted($assets))];
            $revisions = array_map(static fn (array $r): string => $r['status'], $p->revisionRequests);
            $facts[] = [8, $at.'revisions', $revisions === [] ? 'none' : implode(',', $sorted($revisions))];
            $facts[] = [8, $at.'comments', (string) count($p->comments)];
            $kinds = array_map(static fn (array $m): string => $m['kind'], $p->messages);
            $facts[] = [8, $at.'messages', $kinds === [] ? 'none' : implode(',', $kinds)];
        }
        usort($facts, static fn (array $a, array $b): int => ($a[0] <=> $b[0]) ?: strcmp($a[1], $b[1]));

        return array_map(static fn (array $f): string => "{$f[1]}|{$f[2]}", $facts);
    }
}

<?php

namespace Tests\Support;

use RuntimeException;

/**
 * The shared rule fixtures from story 0.6b (`tests/parity/fixtures/rules/*.json`, generated from Next by
 * `apps/web/src/lib/__tests__/shared-rule-fixtures.test.ts`), read in place, never copied (story 2.3 AC 8).
 * The `app` container sees them through a read-only bind mount on the shared `x-php` service definition in
 * `compose.yaml`. A missing directory fails the test run; it never skips.
 */
final class ParityFixture
{
    public const string RULES_DIR = '/var/www/parity-fixtures/rules';

    /**
     * @return list<array{fn: string, input: mixed, expected: mixed}>
     */
    public static function cases(string $file, string $dir = self::RULES_DIR): array
    {
        $path = $dir.'/'.$file;
        if (! is_dir($dir) || ! is_file($path)) {
            throw new RuntimeException(
                "Shared parity fixture {$path} is missing. The app container must mount ../../tests/parity/fixtures/rules "
                .'read-only at '.self::RULES_DIR.' (apps/portal/compose.yaml, x-php volumes): recreate it with '
                .'`docker compose up -d --force-recreate app`.'
            );
        }

        $data = json_decode((string) file_get_contents($path), true, flags: JSON_THROW_ON_ERROR);
        if (! is_array($data) || ! isset($data['cases']) || ! is_array($data['cases']) || $data['cases'] === []) {
            throw new RuntimeException("Shared parity fixture {$path} has no cases.");
        }

        $cases = [];
        foreach ($data['cases'] as $i => $case) {
            if (! is_array($case) || ! is_string($case['fn'] ?? null) || ! array_key_exists('expected', $case)) {
                throw new RuntimeException("Shared parity fixture {$path} case {$i} is malformed.");
            }
            $cases[] = ['fn' => $case['fn'], 'input' => $case['input'] ?? null, 'expected' => $case['expected']];
        }

        return $cases;
    }

    /**
     * One Pest dataset row per case, named by index, fn and input so a failure says which case.
     *
     * @return array<string, array{0: string, 1: mixed, 2: mixed}>
     */
    public static function dataset(string $file): array
    {
        $rows = [];
        foreach (self::cases($file) as $i => $case) {
            $input = json_encode($case['input'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            $name = sprintf('#%03d %s %s', $i, $case['fn'], mb_strimwidth((string) $input, 0, 90, '…'));
            $rows[$name] = [$case['fn'], $case['input'], $case['expected']];
        }

        return $rows;
    }
}

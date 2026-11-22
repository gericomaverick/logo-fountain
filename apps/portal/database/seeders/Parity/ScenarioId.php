<?php

namespace Database\Seeders\Parity;

/**
 * Story 2.6 (O-02): the deterministic id both parity seeders give a row. sha256("<scenario>:<kind>:<key>")
 * shaped as a v4 UUID; a copy of `scenarioId` in apps/web/scripts/parity-seed.mjs and tests/parity/adapters/seed.ts.
 */
final class ScenarioId
{
    public static function for(string $scenario, string $kind, string $key): string
    {
        $h = hash('sha256', $scenario.':'.$kind.':'.$key);
        $variant = dechex((intval($h[16], 16) & 3) | 8);

        return substr($h, 0, 8).'-'.substr($h, 8, 4).'-4'.substr($h, 13, 3).'-'.$variant.substr($h, 17, 3).'-'.substr($h, 20, 12);
    }
}

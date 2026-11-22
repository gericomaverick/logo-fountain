<?php

namespace App\Models\Concerns;

/**
 * Story 2.2 (2.1 decision 1): every timestamp column is `timestamp(3)`, so models read and write
 * milliseconds. Read-state "new" dots and ordering compare these values (`2-1-…md:53,197`).
 * A value Postgres returns without a fraction (`.000`) still parses: Eloquent falls back to Date::parse().
 */
trait HasMillisecondTimestamps
{
    public function getDateFormat(): string
    {
        return 'Y-m-d H:i:s.v';
    }
}

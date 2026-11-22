<?php

namespace App\Models\Concerns;

use App\Support\NodeCompat;
use Illuminate\Database\Eloquent\Casts\Attribute;

/**
 * Story 2.2: `users.email` and `profiles.email` are stored as Next's normalizeAuthEmail
 * (`apps/web/src/lib/auth/service.ts:14`, `trim().toLowerCase()`), with the JS trim() set. The 2.1
 * CHECK constraints (`email = lower(btrim(email))`) refuse anything else.
 */
trait NormalisesEmail
{
    /** @return Attribute<string, string> */
    protected function email(): Attribute
    {
        return Attribute::make(set: fn (string $value): string => NodeCompat::lower(NodeCompat::trimEnv($value)));
    }
}

<?php

namespace App\Support;

/** Story 2.5: the answer of a `RateLimits` consume. Auth mode never sets `retryAfterSeconds`; checkout mode always does on a denial. */
final readonly class RateLimitResult
{
    private function __construct(public bool $allowed, public ?int $retryAfterSeconds) {}

    public static function allowed(): self
    {
        return new self(true, null);
    }

    public static function denied(?int $retryAfterSeconds = null): self
    {
        return new self(false, $retryAfterSeconds);
    }
}

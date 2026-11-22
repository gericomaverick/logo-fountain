<?php

namespace App\Support;

/** Story 2.7: Next's `LifecycleEmailResult` (`project-lifecycle-email.ts:12-15`). */
final readonly class LifecycleMailResult
{
    public const SENT = 'sent';

    public const ALREADY_SENT = 'already_sent';

    public const SKIPPED = 'skipped';

    public const NOT_CONFIGURED = 'not_configured';

    public const MISSING_RECIPIENT = 'missing_recipient';

    private function __construct(public string $status, public ?string $reason = null) {}

    public static function sent(): self
    {
        return new self(self::SENT);
    }

    public static function alreadySent(): self
    {
        return new self(self::ALREADY_SENT);
    }

    public static function skipped(string $reason): self
    {
        return new self(self::SKIPPED, $reason);
    }
}

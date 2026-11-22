<?php

namespace App\Support;

/**
 * Story 2.7: what a feature story hands to `LifecycleMail::sendOnce` (Next's `sendClientEmail` / `sendAdminEmail`
 * input). `ctaPath` is resolved against the canonical origin; `heading` applies to client mail only (admin mail
 * uses the subject as heading, as Next).
 */
final readonly class LifecycleMessage
{
    private function __construct(
        public bool $admin,
        public string $subject,
        public string $intro,
        public string $ctaLabel,
        public string $ctaPath,
        public ?string $heading,
    ) {}

    public static function client(string $subject, string $intro, string $ctaLabel, string $ctaPath, ?string $heading = null): self
    {
        return new self(false, $subject, $intro, $ctaLabel, $ctaPath, $heading);
    }

    public static function admin(string $subject, string $intro, string $ctaLabel, string $ctaPath): self
    {
        return new self(true, $subject, $intro, $ctaLabel, $ctaPath, null);
    }
}

<?php

namespace App\Support\Stripe;

/** `WebhookErrorClassification` (`webhook-error-classification.ts:1-7`). */
final class WebhookClassification
{
    public function __construct(
        public readonly bool $permanent,
        public readonly string $reason,
    ) {}

    public function kind(): string
    {
        return $this->permanent ? 'permanent' : 'transient';
    }

    public function shouldRetry(): bool
    {
        return ! $this->permanent;
    }

    public function status(): int
    {
        return $this->permanent ? 200 : 500;
    }
}

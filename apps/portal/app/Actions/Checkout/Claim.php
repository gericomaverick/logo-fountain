<?php

namespace App\Actions\Checkout;

/** A delivery's hold on a ledger row: the current lease marker (it changes on every renewal). */
final class Claim
{
    public function __construct(
        public readonly string $eventId,
        public readonly string $eventType,
        public string $marker,
    ) {}
}

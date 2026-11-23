<?php

namespace App\Actions\Checkout;

final class ProvisionedAccess
{
    public function __construct(public readonly string $userId, public readonly bool $existed, public readonly bool $needsSetup) {}
}

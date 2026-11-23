<?php

namespace App\Actions\Checkout;

/** What fulfilment reports back to the webhook (the response fields of story 5.2 AC 7). */
final class FulfilmentResult
{
    public function __construct(
        public readonly string $clientId,
        public readonly string $projectId,
        public readonly ?string $purchaserEmail,
        public readonly bool $deduped,
        public readonly string $orderStatus,
        public readonly ?string $provisionedUserId = null,
        public readonly bool $isReturningCustomer = false,
    ) {}

    public function withProvisioning(?string $userId, bool $returning): self
    {
        return new self($this->clientId, $this->projectId, $this->purchaserEmail, $this->deduped, $this->orderStatus, $userId, $returning);
    }
}

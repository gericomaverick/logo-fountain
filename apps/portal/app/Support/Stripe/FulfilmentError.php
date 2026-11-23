<?php

namespace App\Support\Stripe;

use RuntimeException;

/** A fulfilment failure with a code, e.g. `CHECKOUT_SESSION_NOT_PAID` (`checkout-fulfillment.ts`). */
class FulfilmentError extends RuntimeException implements CodedError
{
    public function __construct(string $message, private readonly string $errorCode)
    {
        parent::__construct($message);
    }

    public function errorCode(): string
    {
        return $this->errorCode;
    }
}

<?php

namespace App\Actions\Checkout;

use App\Support\Stripe\FulfilmentError;
use Closure;

/**
 * Bound until story 5.3 lands `FulfilCheckout`. It fails transiently, so the claim is released and Stripe
 * retries: no paid event is settled without a fulfilment.
 */
final class PendingFulfiller implements FulfilsCheckout
{
    public function fulfil(array $session): FulfilmentResult
    {
        throw new FulfilmentError('Checkout fulfilment is not available yet', 'FULFILMENT_NOT_AVAILABLE');
    }

    public function followUp(array $session, FulfilmentResult $result, Closure $renew): FulfilmentResult
    {
        return $result;
    }
}

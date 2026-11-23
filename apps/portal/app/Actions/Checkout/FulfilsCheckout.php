<?php

namespace App\Actions\Checkout;

use Closure;

/**
 * The seam between the webhook ledger (5.2) and fulfilment (5.3). The ledger owns the claim; this does the work.
 * Throw `HopelessCheckoutFailure` for what can never succeed, `FulfilmentError` with a code for the rest.
 */
interface FulfilsCheckout
{
    /**
     * The durable, idempotent part (client, project, order). `$session` is the Checkout Session as an array.
     *
     * @param  array<string, mixed>  $session
     */
    public function fulfil(array $session): FulfilmentResult;

    /**
     * Access provisioning and the emails, each non-idempotent step preceded by `$renew()` (the lease fence, AC 6).
     *
     * @param  array<string, mixed>  $session
     * @param  Closure(): void  $renew
     */
    public function followUp(array $session, FulfilmentResult $result, Closure $renew): FulfilmentResult;
}

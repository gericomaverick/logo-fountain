<?php

namespace App\Support\Stripe;

/** An error carrying a string code, as Node's `error.code` (the webhook classifier reads it). */
interface CodedError
{
    public function errorCode(): string;
}

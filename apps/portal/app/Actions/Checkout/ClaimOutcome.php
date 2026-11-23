<?php

namespace App\Actions\Checkout;

enum ClaimOutcome
{
    case Deduped;
    case InFlight;
}

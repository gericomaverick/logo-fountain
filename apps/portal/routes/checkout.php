<?php

use App\Http\Controllers\Api\CheckoutStartController;
use Illuminate\Support\Facades\Route;

// Epic 5 (checkout). Public and anonymous: no `web` group, so no session is started and no cookie is set (5.1 AC 9).
// A GET that redirects, so the Origin guard (mutations only) does not apply.
Route::get('/checkout/start', CheckoutStartController::class)->name('checkout.start');

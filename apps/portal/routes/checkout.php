<?php

use App\Http\Controllers\Api\CheckoutAuthEmailController;
use App\Http\Controllers\Api\CheckoutStartController;
use App\Http\Controllers\Api\CheckoutStatusController;
use App\Http\Controllers\Webhooks\WebhookController;
use Illuminate\Support\Facades\Route;

// Epic 5 (checkout). Public and anonymous: no `web` group, so no session is started and no cookie is set (5.1 AC 9).
// A GET that redirects, so the Origin guard (mutations only) does not apply.
// Story 5.2: Stripe's webhook. No `web` group; the Origin guard exempts the path (Stripe signs the raw body).
Route::post('/api/stripe/webhook', WebhookController::class)->name('webhooks.stripe');
Route::get('/checkout/start', CheckoutStartController::class)->name('checkout.start');
Route::get('/api/checkout/status', CheckoutStatusController::class)->name('checkout.status');
Route::post('/api/checkout/magic-link', CheckoutAuthEmailController::class)->name('checkout.magic-link');
Route::post('/api/checkout/resend-magic-link', CheckoutAuthEmailController::class)->name('checkout.resend-magic-link');

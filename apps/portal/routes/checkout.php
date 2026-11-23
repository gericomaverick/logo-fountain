<?php

use App\Http\Controllers\Api\CheckoutAuthEmailController;
use App\Http\Controllers\Api\CheckoutStartController;
use App\Http\Controllers\Api\CheckoutStatusController;
use App\Http\Controllers\Api\InvoiceController;
use App\Http\Controllers\Api\ReprocessCheckoutController;
use App\Http\Controllers\Api\UpsellCheckoutController;
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

// Story 5.5 (K-08): the one signed-in checkout route, so it takes the `web` group (session) and the verified-user guard.
Route::middleware(['web', 'auth.verified'])->post('/api/projects/{id}/checkout/session', UpsellCheckoutController::class)->name('checkout.upsell');

// Story 5.6 (K-12): admin reprocess of a paid session; the same fulfilment and follow-up as the webhook (ADR-015).
Route::middleware(['web', 'admin'])->post('/api/admin/checkout/reprocess', ReprocessCheckoutController::class)->name('checkout.reprocess');

// Story 5.7 (K-11, API half): invoice and receipt lists. Signed in; the project list needs membership, the admin list the admin role.
Route::middleware(['web', 'auth.verified'])->get('/api/invoices', [InvoiceController::class, 'mine'])->name('invoices.mine');
Route::middleware(['web', 'auth.verified'])->get('/api/projects/{id}/invoices', [InvoiceController::class, 'project'])->name('invoices.project');
Route::middleware(['web', 'admin'])->get('/api/admin/projects/{id}/invoices', [InvoiceController::class, 'admin'])->name('invoices.admin');

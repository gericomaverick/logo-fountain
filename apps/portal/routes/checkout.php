<?php

use App\Http\Controllers\Api\CheckoutAuthEmailController;
use App\Http\Controllers\Api\CheckoutStartController;
use App\Http\Controllers\Api\CheckoutStatusController;
use App\Http\Controllers\Api\ConceptCommentController;
use App\Http\Controllers\Api\ConceptController;
use App\Http\Controllers\Api\InvoiceController;
use App\Http\Controllers\Api\ProjectBriefController;
use App\Http\Controllers\Api\ProjectListController;
use App\Http\Controllers\Api\ProjectSnapshotController;
use App\Http\Controllers\Api\ReprocessCheckoutController;
use App\Http\Controllers\Api\RevisionRequestController;
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

// Story 6.1 (C-02, list): the caller's projects across their client memberships.
Route::middleware(['web', 'auth.verified'])->get('/api/projects', ProjectListController::class)->name('projects.index');
// Story 6.2a (C-02 snapshot, C-16 entitlements). Signed in; the snapshot takes an admin or a member, entitlements a member.
Route::middleware(['web', 'auth.verified'])->get('/api/projects/{id}', [ProjectSnapshotController::class, 'show'])->name('projects.snapshot');
Route::middleware(['web', 'auth.verified'])->get('/api/projects/{id}/entitlements', [ProjectSnapshotController::class, 'entitlements'])->name('projects.entitlements');
Route::middleware(['web', 'auth.verified'])->get('/api/projects/{id}/concepts', [ConceptController::class, 'index'])->name('concepts.index');
Route::middleware(['web', 'auth.verified'])->get('/api/projects/{id}/concepts/{conceptId}/assets', [ConceptController::class, 'assets'])->name('concepts.assets');

// Stories 6.5/6.6 (C-06 draft, C-07 brief). Brief GET: admin or member; draft and POST: member only.
Route::middleware(['web', 'auth.verified'])->group(function () {
    Route::get('/api/projects/{id}/brief', [ProjectBriefController::class, 'show'])->name('projects.brief.show');
    Route::post('/api/projects/{id}/brief', [ProjectBriefController::class, 'submit'])->name('projects.brief.submit');
    Route::get('/api/projects/{id}/brief/draft', [ProjectBriefController::class, 'draft'])->name('projects.brief.draft');
    Route::put('/api/projects/{id}/brief/draft', [ProjectBriefController::class, 'saveDraft'])->name('projects.brief.draft.save');
    Route::delete('/api/projects/{id}/brief/draft', [ProjectBriefController::class, 'discardDraft'])->name('projects.brief.draft.discard');
});

// Story 6.8 (C-10 comments: admin or member; C-11 revision request: member only).
Route::middleware(['web', 'auth.verified'])->group(function () {
    Route::get('/api/projects/{id}/concepts/{conceptId}/comments', [ConceptCommentController::class, 'index'])->name('concepts.comments.index');
    Route::post('/api/projects/{id}/concepts/{conceptId}/comments', [ConceptCommentController::class, 'store'])->name('concepts.comments.store');
    Route::post('/api/projects/{id}/revision-requests', [RevisionRequestController::class, 'store'])->name('revisions.store');
});

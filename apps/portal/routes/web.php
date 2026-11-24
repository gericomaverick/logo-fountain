<?php

use App\Domain\ProjectTimeline;
use App\Http\Controllers\ProjectOverviewController;
use App\Http\Middleware\EnforceSessionCap;
use App\Models\User;
use App\Support\Auth\SafeNext;
use App\Support\AuthProxyConfig;
use App\Support\ClientAddress;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

// A-16 (story 4.8): `/` goes to sign-in (`app/page.tsx:3-5`). /up is registered in bootstrap/app.php.
Route::get('/', fn () => redirect('/login'))->name('home');

// Story 4.9b (A-05..A-08, UX §14): the auth screens. A signed-in visitor to /login is redirected to the safe `next`, by default /dashboard; `next` is
// untrusted and only ever reaches the page through SafeNext. The token-bearing pages read their fragment client-side.
Route::get('/login', function (Request $request) {
    $next = SafeNext::path(is_string($request->query('next')) ? $request->query('next') : null);
    if ($request->attributes->get(EnforceSessionCap::USER) instanceof User) {
        return redirect($next); // AC 7: SafeNext's default is /dashboard
    }

    return Inertia::render('Auth/Login', [
        'next' => $next,
        'passwordUpdated' => $request->query('password') === 'updated',
    ]);
})->middleware(EnforceSessionCap::class)->name('login');
Route::get('/forgot-password', fn () => Inertia::render('Auth/ForgotPassword'))->name('password.forgot');
Route::get('/set-password', fn () => Inertia::render('Auth/SetPassword'))->name('password.set');
Route::get('/reset-password', fn () => Inertia::render('Auth/ResetPassword'))->name('password.reset');
Route::get('/checkout/success', fn () => Inertia::render('Checkout/Success'))->name('checkout.success');
Route::get('/checkout/continue', fn () => Inertia::render('Checkout/Continue'))->name('checkout.continue');
Route::get('/auth/callback', fn () => Inertia::render('Auth/Callback'))->name('auth.callback');

// Story 4.8 open question 1: the only guarded page until Epic 6 builds the dashboard; later epics attach
// `auth.verified` / `admin` to their own routes.
Route::get('/dashboard', fn () => Inertia::render('Home'))->middleware('auth.verified')->name('dashboard');
Route::get('/project/{id}', [ProjectOverviewController::class, 'show'])->middleware('auth.verified')->name('project.overview');

// Dev-only routes: local and testing, never production or staging. Decided when the routes load, so
// `route:cache` on a production box leaves them out (tests/Feature/DevUiRouteTest.php).
if (app()->environment(['local', 'testing'])) {
    // Story 1.5 (X-05): what each proxy rule derives for this request, so the dev nginx overwrite can be
    // tested end to end (tests/Feature/NginxClientAddressTest.php).
    Route::get('/dev/client-address', fn (Request $request) => response()->json([
        'address' => ClientAddress::for($request),
        'remoteAddr' => $request->server('REMOTE_ADDR'),
        'cfConnectingIp' => ClientAddress::trusted($request, AuthProxyConfig::from('cf-connecting-ip', null)),
        'xRealIp' => ClientAddress::trusted($request, AuthProxyConfig::from('x-real-ip', null)),
        'oneHop' => ClientAddress::trusted($request, AuthProxyConfig::from(null, '1')),
    ]))->name('dev.client-address');

    // The token showcase that `/` used to render (theme.spec.ts); `/` now redirects to /login (story 4.9b).
    Route::get('/dev/tokens', fn () => Inertia::render('Home'))->name('dev.tokens');

    // The component catalogue (UX §6 rule 5, ADR-022, story 1.8a).
    Route::get('/dev/ui', fn () => Inertia::render('Dev/Ui'))->name('dev.ui');
    // Story 1.8b: the status components, on their own page so their baselines stay separate.
    Route::get('/dev/ui/status', fn () => Inertia::render('Dev/UiStatus'))->name('dev.ui.status');

    // Media and data components, Card/Panel, Tabs and usePolling (story 1.8c).
    Route::get('/dev/ui/media', fn () => Inertia::render('Dev/UiMedia'))->name('dev.ui.media');

    // Story 6.2b: the Overview with a fixture snapshot, for tests/Browser/project-overview.spec.ts (the spec stubs
    // GET /api/projects/{id} to move the status). `?status=` and `?revisions=` (left) pick the state; no database.
    Route::get('/dev/project-overview', function (Request $request) {
        $status = $request->string('status', 'AWAITING_BRIEF')->limit(30, '')->toString();
        $left = max(0, min(5, $request->integer('revisions', 2)));

        return Inertia::render('Project/Overview', [
            'projectId' => '00000000-0000-4000-8000-000000000001',
            'snapshot' => [
                'id' => '00000000-0000-4000-8000-000000000001',
                'status' => $status,
                'packageCode' => 'essential',
                'timeline' => ProjectTimeline::build($status, [], false),
                'entitlementUsage' => [
                    'concepts' => ['limit' => 3, 'consumed' => 2, 'reserved' => 0, 'remaining' => 1],
                    'revisions' => ['limit' => 3, 'consumed' => 3 - $left, 'reserved' => 0, 'remaining' => $left],
                ],
                'messages' => [['id' => 'm1', 'kind' => 'system', 'body' => 'Your brief was submitted.', 'createdAt' => '2026-01-01T10:00:00Z']],
                'latestBrief' => ['answers' => ['brandName' => 'Northvale Coffee']],
            ],
            'user' => ['name' => 'Sam Rivera', 'email' => 'sam@example.com'],
        ]);
    })->name('dev.project-overview');

    // Story 1.9: the customer and admin shells with sample props. `?section=` picks the page, so the
    // section tabs are real links between URLs (unknown values fall back to a page outside a project).
    Route::get('/dev/ui/shells', fn (Request $request) => Inertia::render('Dev/UiShells', [
        'shell' => 'customer',
        'section' => $request->string('section', 'overview')->limit(20, '')->toString(),
    ]))->name('dev.ui.shells');
    Route::get('/dev/ui/shells/admin', fn (Request $request) => Inertia::render('Dev/UiShells', [
        'shell' => 'admin',
        'section' => $request->string('section', 'overview')->limit(20, '')->toString(),
    ]))->name('dev.ui.shells.admin');
}

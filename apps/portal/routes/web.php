<?php

use App\Domain\ProjectTimeline;
use App\Http\Controllers\Pages\DashboardController;
use App\Http\Controllers\Pages\ProjectConceptsController;
use App\Http\Controllers\Pages\ProjectOverviewController;
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

// Story 6.1: the project list (one project goes straight to its Overview). Guarded pages attach `auth.verified`; admin
// pages will attach `admin` with Epic 7.
Route::get('/dashboard', DashboardController::class)->middleware('auth.verified')->name('dashboard');
Route::get('/project/{id}', [ProjectOverviewController::class, 'show'])->middleware('auth.verified')->name('project.overview');
Route::get('/project/{id}/concepts', [ProjectConceptsController::class, 'gallery'])->middleware('auth.verified')->name('project.concepts');
Route::get('/project/{id}/concept/{conceptId}', [ProjectConceptsController::class, 'show'])->middleware('auth.verified')->name('project.concept');

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

    // Story 6.1: the project list with fixture rows (`?n=` projects, default 3, up to 5), for tests/browser/project-list.spec.ts.
    Route::get('/dev/dashboard', function (Request $request) {
        $rows = [
            ['id' => '00000000-0000-4000-8000-000000000001', 'status' => 'CONCEPTS_READY', 'packageCode' => 'professional', 'name' => 'Northvale Coffee', 'hasNewConcepts' => true, 'hasNewMessages' => false],
            ['id' => '00000000-0000-4000-8000-000000000002', 'status' => 'IN_DESIGN', 'packageCode' => 'essential', 'name' => 'Fernhill Bakery', 'hasNewConcepts' => false, 'hasNewMessages' => true],
            ['id' => '00000000-0000-4000-8000-000000000003', 'status' => 'DELIVERED', 'packageCode' => 'complete', 'name' => null, 'hasNewConcepts' => false, 'hasNewMessages' => false],
            ['id' => '00000000-0000-4000-8000-000000000004', 'status' => 'ON_HOLD', 'packageCode' => 'essential', 'name' => 'Harbour Studio', 'hasNewConcepts' => false, 'hasNewMessages' => false],
            ['id' => '00000000-0000-4000-8000-000000000005', 'status' => 'CANCELLED', 'packageCode' => 'essential', 'name' => 'Old Mill', 'hasNewConcepts' => false, 'hasNewMessages' => false],
        ];

        return Inertia::render('Dashboard', [
            'projects' => array_slice($rows, 0, max(0, min(5, $request->integer('n', 3)))),
            'user' => ['name' => 'Sam Rivera', 'email' => 'sam@example.com'],
        ]);
    })->name('dev.dashboard');

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
                'hasNewConcepts' => $request->boolean('new'),
            ],
            'user' => ['name' => 'Sam Rivera', 'email' => 'sam@example.com'],
        ]);
    })->name('dev.project-overview');

    // Story 6.7: the gallery and the viewer with fixture props, for tests/browser/project-concepts.spec.ts (the spec stubs
    // the /api/projects/{id}/concepts, .../assets and read-state calls). `?new=1` shows the Concepts tab dot; story 6.8: `?left=N` revisions left, `?project=STATUS`.
    $conceptFixture = fn (Request $request) => [
        'projectId' => '00000000-0000-4000-8000-000000000001',
        'snapshot' => ['id' => '00000000-0000-4000-8000-000000000001', 'status' => $request->string('project', 'CONCEPTS_READY')->limit(24, '')->toString(), 'packageCode' => 'essential', 'timeline' => [], 'entitlementUsage' => ['concepts' => ['limit' => 3, 'consumed' => 2, 'reserved' => 0, 'remaining' => 1], 'revisions' => $request->boolean('unlimited') ? ['unlimited' => true, 'consumed' => 0, 'reserved' => 0] : ['limit' => 3, 'consumed' => 3 - $request->integer('left', 3) - $request->integer('reserved', 0), 'reserved' => $request->integer('reserved', 0), 'remaining' => $request->integer('left', 3)]], 'revisionRequests' => [['id' => 'r1', 'status' => 'submitted', 'body' => 'Make the mark bolder', 'createdAt' => '2026-11-03T09:00:00Z', 'updatedAt' => '2026-11-03T09:00:00Z', 'concept' => ['id' => '00000000-0000-4000-8000-0000000000c1', 'number' => 2], 'user' => ['id' => 'u1', 'email' => 'sam@example.com', 'fullName' => 'Sam Rivera']]], 'hasNewConcepts' => $request->boolean('new'), 'hasNewMessages' => false, 'latestBrief' => ['answers' => ['brandName' => 'Northvale Coffee']]],
        'user' => ['name' => 'Sam Rivera', 'email' => 'sam@example.com'],
    ];
    Route::get('/dev/project-concepts', fn (Request $request) => Inertia::render('Project/Concepts', $conceptFixture($request)))->name('dev.project-concepts');
    Route::get('/dev/project-concept', fn (Request $request) => Inertia::render('Project/Concept', $conceptFixture($request) + [
        'concept' => ['id' => '00000000-0000-4000-8000-0000000000c1', 'number' => 2, 'status' => $request->string('status', 'published')->limit(12, '')->toString(), 'notes' => 'A bolder direction'],
    ]))->name('dev.project-concept');

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

<?php

use App\Support\AuthProxyConfig;
use App\Support\ClientAddress;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

// Placeholder until the real pages land (Epic 6+). /up is registered in bootstrap/app.php.
Route::get('/', fn () => Inertia::render('Home'))->name('home');

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

    // The component catalogue (UX §6 rule 5, ADR-022, story 1.8a).
    Route::get('/dev/ui', fn () => Inertia::render('Dev/Ui'))->name('dev.ui');
    // Media and data components, Card/Panel, Tabs and usePolling (story 1.8c).
    Route::get('/dev/ui/media', fn () => Inertia::render('Dev/UiMedia'))->name('dev.ui.media');
}

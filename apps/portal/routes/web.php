<?php

use App\Support\AuthProxyConfig;
use App\Support\ClientAddress;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

// Placeholder until the real pages land (Epic 6+). /up is registered in bootstrap/app.php.
Route::get('/', fn () => Inertia::render('Home'))->name('home');

// Story 1.5 (X-05): what each proxy rule derives for this request, so the dev nginx overwrite can be
// tested end to end (tests/Feature/NginxClientAddressTest.php). Local and testing only.
if (app()->environment(['local', 'testing'])) {
    Route::get('/dev/client-address', fn (Request $request) => response()->json([
        'address' => ClientAddress::for($request),
        'remoteAddr' => $request->server('REMOTE_ADDR'),
        'cfConnectingIp' => ClientAddress::trusted($request, AuthProxyConfig::from('cf-connecting-ip', null)),
        'xRealIp' => ClientAddress::trusted($request, AuthProxyConfig::from('x-real-ip', null)),
        'oneHop' => ClientAddress::trusted($request, AuthProxyConfig::from(null, '1')),
    ]))->name('dev.client-address');
}

<?php

use App\Http\Controllers\Auth\AuthLinkRequestController;
use App\Http\Controllers\Auth\LoginController;
use App\Http\Controllers\Auth\SessionController;
use App\Http\Middleware\EnforceSessionCap;
use App\Http\Middleware\EnsureAuthAvailable;
use App\Http\Middleware\OmitSessionCookieOnFailure;
use Illuminate\Support\Facades\Route;

// Auth routes (Epic 4), loaded with the `web` group from bootstrap/app.php. Stories 4.3-4.9 add theirs here.
// EnsureAuthAvailable first (Next `session/route.ts:6`: the proxy check precedes any lookup).
Route::prefix('api/auth')->middleware([EnsureAuthAvailable::class, 'auth.json:headers', EnforceSessionCap::class])->group(function () {
    Route::get('/session', [SessionController::class, 'show'])->name('auth.session');
});

// A-01 (story 4.3): body-reading mutation. No EnforceSessionCap (Next's login ignores any existing session).
Route::prefix('api/auth')->middleware([EnsureAuthAvailable::class, 'auth.json', OmitSessionCookieOnFailure::class])->group(function () {
    Route::post('/login', [LoginController::class, 'store'])->name('auth.login');
});

// A-05/A-07 request halves (story 4.4): body-reading mutations, same boundary as login.
Route::prefix('api/auth')->middleware([EnsureAuthAvailable::class, 'auth.json', OmitSessionCookieOnFailure::class])->group(function () {
    Route::post('/magic-link', [AuthLinkRequestController::class, 'magicLink'])->name('auth.magic-link');
    Route::post('/forgot-password', [AuthLinkRequestController::class, 'forgotPassword'])->name('auth.forgot-password');
});

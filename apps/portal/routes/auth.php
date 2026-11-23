<?php

use App\Http\Controllers\Auth\AccountSessionController;
use App\Http\Controllers\Auth\AuthLinkRequestController;
use App\Http\Controllers\Auth\LoginController;
use App\Http\Controllers\Auth\MagicLinkController;
use App\Http\Controllers\Auth\PasswordResetController;
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

// A-05 confirm half (story 4.5): body-reading mutation that issues a session (no failure cookie).
Route::prefix('api/auth')->middleware([EnsureAuthAvailable::class, 'auth.json', OmitSessionCookieOnFailure::class])->group(function () {
    Route::post('/magic-link/verify', [MagicLinkController::class, 'verify'])->name('auth.magic-link.verify');
});

// A-07/A-08 (story 4.6): reset and setup links both post here. Signs nobody in, so no cookie even on success.
Route::prefix('api/auth')->middleware([EnsureAuthAvailable::class, 'auth.json', OmitSessionCookieOnFailure::class.':always'])->group(function () {
    Route::post('/reset-password', [PasswordResetController::class, 'store'])->name('auth.reset-password');
});

// A-02 / A-09 (story 4.7). Logout: origin, then proxy, then sign-out (no body). Change: session cap decides who is asking.
Route::prefix('api/auth')->middleware([EnsureAuthAvailable::class, 'auth.json:headers', OmitSessionCookieOnFailure::class.':clear'])->group(function () {
    Route::post('/logout', [AccountSessionController::class, 'logout'])->name('auth.logout');
});
Route::prefix('api/auth')->middleware([EnsureAuthAvailable::class, 'auth.json', EnforceSessionCap::class, OmitSessionCookieOnFailure::class.':clear'])->group(function () {
    Route::post('/password', [AccountSessionController::class, 'changePassword'])->name('auth.password');
});

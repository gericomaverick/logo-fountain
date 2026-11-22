<?php

use App\Http\Controllers\Auth\SessionController;
use App\Http\Middleware\EnforceSessionCap;
use App\Http\Middleware\EnsureAuthAvailable;
use Illuminate\Support\Facades\Route;

// Auth routes (Epic 4), loaded with the `web` group from bootstrap/app.php. Stories 4.3-4.9 add theirs here.
// EnsureAuthAvailable first (Next `session/route.ts:6`: the proxy check precedes any lookup).
Route::prefix('api/auth')->middleware([EnsureAuthAvailable::class, 'auth.json:headers', EnforceSessionCap::class])->group(function () {
    Route::get('/session', [SessionController::class, 'show'])->name('auth.session');
});

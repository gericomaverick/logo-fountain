<?php

use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

// Placeholder until the real pages land (Epic 6+). /up is registered in bootstrap/app.php.
Route::get('/', fn () => Inertia::render('Home'))->name('home');

// The component catalogue (UX §6 rule 5, ADR-022, story 1.8a): local and testing only, never
// production or staging. Decided when the routes load, so `route:cache` on a production box
// leaves it out too (tests/Feature/DevUiRouteTest.php).
if (app()->environment(['local', 'testing'])) {
    Route::get('/dev/ui', fn () => Inertia::render('Dev/Ui'))->name('dev.ui');
}

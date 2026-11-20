<?php

use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

// Placeholder until the real pages land (Epic 6+). /up is registered in bootstrap/app.php.
Route::get('/', fn () => Inertia::render('Home'))->name('home');

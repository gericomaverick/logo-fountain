<?php

use App\Http\Middleware\AuthJsonBoundary;
use App\Http\Middleware\HandleInertiaRequests;
use App\Http\Middleware\SecurityHeaders;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // X-02 (story 1.6): outermost, so it runs last and overrides route values, as next.config does.
        $middleware->prepend(SecurityHeaders::class);
        // A-17 (story 1.6): `auth.json` on body-reading auth mutations, `auth.json:headers` on the rest.
        $middleware->alias(['auth.json' => AuthJsonBoundary::class]);

        $middleware->web(append: [
            HandleInertiaRequests::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();

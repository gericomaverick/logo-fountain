<?php

// Story 4.2 AC 9 (ADR-007): the credential lock has one caller, and credential writers go through the fence.

function phpFilesUnder(string $dir): array
{
    $files = [];
    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS)) as $f) {
        if ($f->getExtension() === 'php') {
            $files[] = $f->getPathname();
        }
    }

    return $files;
}

it('takes the credential lock only inside CredentialFence', function () {
    $callers = array_values(array_filter(
        phpFilesUnder(app_path()),
        fn (string $f) => str_contains((string) file_get_contents($f), 'Locks::credential')
    ));

    $allowed = [app_path('Support/Auth/CredentialFence.php')];
    expect(array_values(array_diff($callers, $allowed)))->toBe([]);
});

it('has every credential-writing auth action call CredentialFence::run', function () {
    $dir = app_path('Actions/Auth');
    $offenders = [];
    foreach (is_dir($dir) ? phpFilesUnder($dir) : [] as $file) {
        $src = (string) file_get_contents($file);
        $writes = preg_match("/credential_version|'password'|auth_proofs/", $src) === 1;
        if ($writes && ! str_contains($src, 'CredentialFence::run')) {
            $offenders[] = $file;
        }
    }

    expect($offenders)->toBe([]);
});

// Story 4.8 AC 3-4 (A-14, A-15): the auth endpoint allowlist, snapshotted.
it('exposes exactly the documented auth routes', function () {
    $routes = [];
    foreach (app('router')->getRoutes()->getRoutes() as $route) {
        if (str_starts_with($route->uri(), 'api/auth')) {
            foreach ($route->methods() as $m) {
                if ($m !== 'HEAD') {
                    $routes[] = $m.' /'.$route->uri();
                }
            }
        }
    }
    sort($routes);

    $expected = [
        'GET /api/auth/session',
        'POST /api/auth/forgot-password',
        'POST /api/auth/login',
        'POST /api/auth/logout',
        'POST /api/auth/magic-link',
        'POST /api/auth/magic-link/verify',
        'POST /api/auth/password',
        'POST /api/auth/reset-password',
    ];
    sort($expected);
    expect($routes)->toBe($expected);
});

it('has no register, OAuth, Fortify, remember-me, password-confirm or native-auth route', function () {
    foreach (app('router')->getRoutes()->getRoutes() as $route) {
        expect($route->uri())->not->toMatch('~(^|/)(register|oauth|fortify|confirm-password|user/confirm-password|auth/native)(/|$)~i');
    }
    config(['portal.public_site_url' => 'https://app.example.com']);
    $headers = ['Origin' => 'https://app.example.com'];
    $this->withHeaders($headers)->getJson('/api/auth/native/sign-in/email')->assertNotFound();
    $this->withHeaders($headers)->postJson('/api/auth/native/sign-in/email', [])->assertNotFound();
});

// Story 4.8 AC 2: a post-auth redirect is never built from the request's `next` without SafeNext.
it('passes every use of the request next through SafeNext', function () {
    $offenders = [];
    foreach (phpFilesUnder(app_path()) as $file) {
        $src = (string) file_get_contents($file);
        $reads = preg_match("/(?:input|query|string|get)\(\s*['\"]next['\"]|\\\$request->next\b|\\\$request\[['\"]next['\"]\]|\\[['\"]next['\"]\]/", $src) === 1;
        // AuthLinkRequestController only forwards the raw value to SendAuthLink, which calls SafeNext::path.
        if ($reads && ! str_contains($src, 'SafeNext::path') && ! str_ends_with($file, 'AuthLinkRequestController.php')) {
            $offenders[] = $file;
        }
    }
    expect($offenders)->toBe([]);
});

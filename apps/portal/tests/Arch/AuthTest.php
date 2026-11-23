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

/** Source with comments removed (so a comment cannot satisfy or trip the rule). */
function codeOnly(string $src): string
{
    $out = '';
    foreach (token_get_all($src) as $t) {
        if (is_array($t)) {
            if (in_array($t[0], [T_COMMENT, T_DOC_COMMENT], true)) {
                continue;
            }
            $out .= $t[1];
        } else {
            $out .= $t;
        }
    }

    return $out;
}

/** Credential WRITES: assigning/bumping the password or credential_version, or writing auth_proofs. Reads and hash checks are not writes. */
const CREDENTIAL_WRITE = '->\s*password\s*(?:=(?!=)|\.=)'
    .'|[\'"]password[\'"]\s*=>'
    .'|credential_version[\'"]?\s*(?:\+\+|--|\+=|-=|=(?!=)|=>)'
    .'|increment\(\s*[\'"]credential_version'
    .'|[\'"]auth_proofs[\'"]\s*\)[^;]*?->\s*(?:insert|insertGetId|insertOrIgnore|update|upsert|delete|truncate|increment|decrement)\('
    .'|AuthProofs::(?:issue|consume|revoke\w*)\(';

/** True if every credential write sits inside a CredentialFence::run( ... ) call's parentheses. */
function writesOnlyInsideFence(string $src): bool
{
    $code = codeOnly($src);
    preg_match_all('~'.CREDENTIAL_WRITE.'~s', $code, $m, PREG_OFFSET_CAPTURE);
    if ($m[0] === []) {
        return true;
    }
    $spans = [];
    $off = 0;
    while (($at = strpos($code, 'CredentialFence::run(', $off)) !== false) {
        $start = $at + strlen('CredentialFence::run(');
        $depth = 1;
        for ($i = $start; $i < strlen($code) && $depth > 0; $i++) {
            $depth += $code[$i] === '(' ? 1 : ($code[$i] === ')' ? -1 : 0);
        }
        $spans[] = [$start, $i];
        $off = $start;
    }
    foreach ($m[0] as [, $pos]) {
        $inside = false;
        foreach ($spans as [$a, $b]) {
            $inside = $inside || ($pos >= $a && $pos < $b);
        }
        if (! $inside) {
            return false;
        }
    }

    return true;
}

it('has the fence scanner reject unfenced credential writes (deliberate violations)', function (string $src) {
    expect(writesOnlyInsideFence($src))->toBeFalse();
})->with([
    'no fence at all' => ['<?php $u->password = $h;'],
    'fence only in a comment' => ['<?php // CredentialFence::run(fn () => 1)'."\n".'$u->password = $h;'],
    'write outside the fence' => ['<?php CredentialFence::run(fn () => 1); $u->credential_version++;'],
    'auth_proofs delete outside' => ['<?php DB::table("auth_proofs")->delete(); CredentialFence::run(fn () => 1);'],
    'password array write outside' => ['<?php $db->table("users")->update(["password" => $h]); CredentialFence::run(fn () => 1);'],
    'proof issue outside' => ['<?php AuthProofs::issue($u, "reset"); CredentialFence::run(fn () => 1);'],
]);

it('has the fence scanner accept reads and hash checks outside the fence', function (string $src) {
    expect(writesOnlyInsideFence($src))->toBeTrue();
})->with([
    'password parameter and Hash::check' => ['<?php function f(string $password) { return Hash::check($password, self::DUMMY_HASH); }'],
    'hasPassword reads the column' => ['<?php function hasPassword($db) { return $db->table("users")->value("password") !== null; } CredentialFence::run($id, fn () => 1);'],
    'version read' => ['<?php $v = (int) $db->table("users")->value("credential_version");'],
    'proof read' => ['<?php $db->table("auth_proofs")->where("user_id", 1)->exists();'],
]);

it('has the fence scanner accept fenced writes', function () {
    expect(writesOnlyInsideFence('<?php CredentialFence::run(function () { $u->password = $h; $u->credential_version++; });'))->toBeTrue()
        ->and(writesOnlyInsideFence('<?php return 1;'))->toBeTrue();
});

// app/Actions/Auth exists since story 4.4/4.5; this now scans real actions (the scanner is proven above).
it('has every credential-writing auth action call CredentialFence::run', function () {
    $dir = app_path('Actions/Auth');
    $offenders = [];
    foreach (is_dir($dir) ? phpFilesUnder($dir) : [] as $file) {
        if (! writesOnlyInsideFence((string) file_get_contents($file))) {
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

// Story 4.9a AC 6 (A-12): the bootstrap command is never run automatically.
it('does not run portal:bootstrap-admin from any hook, scheduler, seeder, route or image', function () {
    $roots = [base_path('composer.json'), base_path('Dockerfile'), base_path('routes'), base_path('database/seeders'), base_path('docker'), base_path('../../.github')];
    $hits = [];
    foreach ($roots as $root) {
        $files = is_dir($root) ? array_map(fn ($f) => $f->getPathname(), iterator_to_array(new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS)))) : (is_file($root) ? [$root] : []);
        foreach ($files as $f) {
            if (str_contains((string) file_get_contents($f), 'bootstrap-admin')) {
                $hits[] = $f;
            }
        }
    }
    expect($hits)->toBe([]);
});

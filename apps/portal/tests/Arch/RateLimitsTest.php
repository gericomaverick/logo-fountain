<?php

use Illuminate\Support\Facades\File;

// Story 2.5 AC 1 (ADR-009): only RateLimits touches the bucket table and the limits connection, and nothing
// uses Laravel's cache rate limiter. Pest arch() can't see string literals, so the first is a source scan of app/.

it('names auth_rate_limits and the pgsql_limits connection only where allowed', function () {
    $rules = [
        '/auth_rate_limits/' => ['Support/RateLimits.php'],
        '/pgsql_limits|DatabaseRoles::LIMITS/' => ['Support/RateLimits.php', 'Support/DatabaseRoles.php'],
    ];
    $violations = [];
    foreach (File::allFiles(app_path()) as $file) {
        if ($file->getExtension() !== 'php') {
            continue;
        }
        $relative = str_replace('\\', '/', $file->getRelativePathname());
        foreach ($rules as $pattern => $allowed) {
            if (preg_match($pattern, $file->getContents()) === 1 && ! in_array($relative, $allowed, true)) {
                $violations[] = "{$relative} matches {$pattern}";
            }
        }
    }

    expect($violations)->toBe([]);
});

arch('nothing uses the cache-backed RateLimiter')
    ->expect('App')
    ->not->toUse(['Illuminate\Support\Facades\RateLimiter', 'Illuminate\Cache\RateLimiter', 'Illuminate\Cache\RateLimiting\Limit']);

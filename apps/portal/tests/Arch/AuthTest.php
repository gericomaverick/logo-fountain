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

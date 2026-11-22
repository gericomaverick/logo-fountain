<?php

use Illuminate\Support\Facades\File;

// Story 3.1 (ADR-016): private objects go through Support/Storage only: no SDK, Storage facade or Flysystem elsewhere.

it('keeps the AWS SDK, the Storage facade and Flysystem inside app/Support/Storage', function () {
    $violations = [];
    foreach (File::allFiles(app_path()) as $file) {
        $relative = str_replace('\\', '/', $file->getRelativePathname());
        if ($file->getExtension() !== 'php' || str_starts_with($relative, 'Support/Storage/')) {
            continue;
        }
        if (preg_match('/Aws\\\\|Illuminate\\\\Support\\\\Facades\\\\Storage|League\\\\Flysystem/', $file->getContents()) === 1) {
            $violations[] = $relative;
        }
    }
    expect($violations)->toBe([]);
});

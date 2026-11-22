<?php

use App\Support\Uploads\FinalZipValidator;
use App\Support\Uploads\UploadValidationException;
use Tests\Support\UploadCorpus;

// Story 3.3 AC 1 (X-12, DV-13): every `zip` case of the golden corpus gets the LARAVEL-expected code
// (`laravelExpectedCode` when present) and, where recorded, Next's message (`branch`; DV-13 size message aside).

it('judges every zip corpus case as Laravel must', function (array $case) {
    $path = UploadCorpus::path($case);
    $declared = (int) filesize($path);
    try {
        $r = (new FinalZipValidator)->prepare($path, $case['filename'], $case['mime'], $declared);
    } catch (UploadValidationException $e) {
        expect($e->errorCode)->toBe($case['code']);
        // DV-13: the size message carries the new figure, so it differs from Next's recorded `branch`.
        expect($e->getMessage())->toBe(
            $case['code'] === 'FILE_TOO_LARGE' ? 'Final ZIP exceeds the 95 MB limit' : $case['branch']
        );

        return;
    }
    expect($case['code'])->toBeNull()
        ->and($r->path)->toBe($path)
        ->and($r->contentType)->toBe('application/zip')
        ->and($r->size)->toBe($declared);
})->with(fn () => UploadCorpus::dataset('zip'))->group('uploads', 'unit');

it('has all 129 zip cases', function () {
    expect(UploadCorpus::cases('zip'))->toHaveCount(129);
})->group('uploads', 'unit');

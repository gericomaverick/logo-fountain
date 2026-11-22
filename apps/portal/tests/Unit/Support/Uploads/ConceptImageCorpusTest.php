<?php

use App\Support\Uploads\ConceptImageValidator;
use App\Support\Uploads\UploadValidationException;
use Tests\Support\UploadCorpus;

// Story 3.2 AC 1 (X-12): every `image` case of the golden corpus (tests/parity/fixtures/uploads/manifest.json, 138 cases)
// gets Next's code and, where the manifest records one, Next's message (`branch`), so the case reaches the intended branch.

it('judges every image corpus case as Next did', function (array $case) {
    $path = UploadCorpus::path($case);
    $declared = $case['generated'] ? $case['size'] : (int) filesize($path);
    try {
        $r = (new ConceptImageValidator)->prepare($path, $case['filename'], $case['mime'], $declared);
    } catch (UploadValidationException $e) {
        expect($e->errorCode)->toBe($case['code'])
            ->and($e->getMessage())->toBe($case['branch']);

        return;
    }
    expect($case['code'])->toBeNull()
        ->and($r->path)->toBe($path)
        ->and($r->size)->toBe($declared);
})->with(fn () => UploadCorpus::dataset('image'))->group('uploads', 'unit');

it('has all 138 image cases', function () {
    expect(UploadCorpus::cases('image'))->toHaveCount(138);
})->group('uploads', 'unit');

<?php

use App\Support\Uploads\FinalZipValidator;
use App\Support\Uploads\UploadValidationException;
use Tests\Support\UploadCorpus;

// Story 3.3 AC 5: the 600 MiB-expanded bomb is stopped at the 500 MiB limit by chunked inflation, never held whole.

it('stops a bomb at the expanded-size limit with bounded memory', function () {
    $case = collect(UploadCorpus::cases('zip'))->firstWhere('id', 'zip-total-expanded-over-500mib');
    $path = UploadCorpus::path($case); // built before the baseline: the builder holds one 8 MB payload
    gc_collect_cycles();
    $before = memory_get_usage();
    $peakBefore = memory_get_peak_usage();
    try {
        (new FinalZipValidator)->prepare($path, 'bomb.zip', 'application/zip', (int) filesize($path));
        $this->fail('The bomb was accepted.');
    } catch (UploadValidationException $e) {
        expect($e->errorCode)->toBe('ZIP_LIMIT_EXCEEDED');
    }
    expect(max(memory_get_peak_usage() - $peakBefore, memory_get_usage() - $before))->toBeLessThan(64 * 1024 * 1024);
})->group('uploads', 'unit');

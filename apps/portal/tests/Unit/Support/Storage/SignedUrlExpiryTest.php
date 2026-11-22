<?php

use App\Support\Storage\SignedUrlExpiry;

it('accepts integers 1 and 3600', function (int $v) {
    expect(SignedUrlExpiry::check($v))->toBe($v);
})->with([1, 60, 3600]);

it('rejects everything else', function (mixed $v) {
    SignedUrlExpiry::check($v);
})->with([0, 3601, -1, 1.5, '10', NAN, null, true])
    ->throws(InvalidArgumentException::class, 'Signed URL expiry must be an integer between 1 and 3600 seconds');

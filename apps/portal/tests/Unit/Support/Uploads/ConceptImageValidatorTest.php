<?php

use App\Support\Uploads\ConceptImageValidator;
use App\Support\Uploads\PreparedUpload;
use App\Support\Uploads\UploadValidationException;

// Story 3.2 (X-12 images, ledger #108): the `concept image validation` tests of
// apps/web/src/lib/upload-validation.test.ts:87-133, ported 1:1, plus the Laravel-specific size-before-read,
// client-MIME-not-sniffed and 40 MP boundary cases. Bytes are built here the way Next's test helpers build them.

function imgChunk(string $type, string $data): string
{
    return pack('N', strlen($data)).$type.$data.pack('N', crc32($type.$data));
}

function imgPng(int $width = 1, int $height = 1): string
{
    $ihdr = pack('NN', $width, $height)."\x08\x06\x00\x00\x00";

    return "\x89PNG\r\n\x1a\n".imgChunk('IHDR', $ihdr).imgChunk('IDAT', (string) gzcompress("\x00\xff\x00\x00\xff")).imgChunk('IEND', '');
}

function imgJpeg(): string
{
    return "\xff\xd8\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xda\x00\x08\x01\x01\x00\x00\x3f\x00\x01\xff\xd9";
}

function imgWebp(): string
{
    return "RIFF\x12\x00\x00\x00WEBPVP8L\x06\x00\x00\x00\x2f\x00\x00\x00\x00\x00";
}

/** Runs the validator on a temp file holding $bytes; returns the PreparedUpload or the exception. */
function imgPrepare(string $bytes, string $name, ?string $mime): PreparedUpload|UploadValidationException
{
    $path = tempnam(sys_get_temp_dir(), 'img-');
    file_put_contents($path, $bytes);
    try {
        return (new ConceptImageValidator)->prepare($path, $name, $mime, strlen($bytes));
    } catch (UploadValidationException $e) {
        return $e;
    } finally {
        unlink($path);
    }
}

function imgCode(string $bytes, string $name, ?string $mime): ?string
{
    $r = imgPrepare($bytes, $name, $mime);

    return $r instanceof UploadValidationException ? $r->errorCode : null;
}

it('accepts a structurally valid allowlisted image with canonical metadata', function (string $bytes, string $name, string $mime, string $extension) {
    $r = imgPrepare($bytes, $name, $mime);
    expect($r)->toBeInstanceOf(PreparedUpload::class)
        ->and($r->contentType)->toBe($mime)
        ->and($r->extension)->toBe($extension) // jpeg is stored as jpg
        ->and($r->size)->toBe(strlen($bytes));
})->with([
    'png' => fn () => [imgPng(), 'logo.png', 'image/png', 'png'],
    'jpeg stored as jpg' => fn () => [imgJpeg(), 'logo.jpeg', 'image/jpeg', 'jpg'],
    'webp' => fn () => [imgWebp(), 'logo.webp', 'image/webp', 'webp'],
])->group('uploads', 'unit');

it('rejects PNG without IDAT or with bad CRC, and VP8X without payload', function () {
    $full = imgPng();
    $noData = substr($full, 0, 33).substr($full, -12);
    $corrupt = $full;
    $corrupt[29] = chr(ord($corrupt[29]) ^ 1);
    foreach ([$noData, $corrupt] as $body) {
        expect(imgCode($body, 'x.png', 'image/png'))->toBe('MALFORMED_IMAGE');
    }
    $extended = str_pad("RIFF\x16\x00\x00\x00WEBPVP8X\x0a", 30, "\0");
    expect(imgCode($extended, 'x.webp', 'image/webp'))->toBe('MALFORMED_IMAGE');
})->group('uploads', 'unit');

it('examines JPEG segments after the first scan', function () {
    $body = imgJpeg();
    $lateFrame = substr($body, 0, -2).substr($body, 2);
    expect(imgCode($lateFrame, 'x.jpg', 'image/jpeg'))->toBe('MALFORMED_IMAGE');
})->group('uploads', 'unit');

it('rejects SVG even when it declares an image MIME', function () {
    expect(imgCode('<svg/ >', 'logo.svg', 'image/svg+xml'))->toBe('INVALID_FILE_TYPE');
})->group('uploads', 'unit');

it('rejects a spoofed extension/MIME pair and spoofed magic bytes', function () {
    expect(imgCode(imgPng(), 'logo.jpg', 'image/png'))->toBe('INVALID_FILE_TYPE')
        ->and(imgCode('not png', 'logo.png', 'image/png'))->toBe('FILE_SIGNATURE_MISMATCH');
})->group('uploads', 'unit');

it('rejects malformed and excessive decode dimensions', function () {
    expect(imgCode(substr(imgPng(), 0, 33), 'logo.png', 'image/png'))->toBe('MALFORMED_IMAGE')
        ->and(imgCode(imgPng(10_000, 10_000), 'logo.png', 'image/png'))->toBe('IMAGE_DIMENSIONS_TOO_LARGE');
})->group('uploads', 'unit');

it('accepts exactly 40 megapixels and rejects one pixel row more; 32-bit dimensions do not overflow', function () {
    expect(imgCode(imgPng(8_000, 5_000), 'a.png', 'image/png'))->toBeNull()
        ->and(imgCode(imgPng(8_000, 5_001), 'a.png', 'image/png'))->toBe('IMAGE_DIMENSIONS_TOO_LARGE')
        ->and(imgCode(imgPng(4_294_967_295, 4_294_967_295), 'a.png', 'image/png'))->toBe('IMAGE_DIMENSIONS_TOO_LARGE');
})->group('uploads', 'unit');

it('rejects oversized files from the declared size, before any byte is read', function () {
    // The path does not exist: a read attempt would throw a RuntimeException, not an UploadValidationException.
    $v = new ConceptImageValidator;
    expect(fn () => $v->prepare('/nonexistent/unreadable', 'logo.png', 'image/png', ConceptImageValidator::MAX_BYTES + 1))
        ->toThrow(fn (UploadValidationException $e) => $e->errorCode === 'FILE_TOO_LARGE' && $e->getMessage() === 'Concept image exceeds the 10 MB limit');
    expect(fn () => $v->prepare('/nonexistent/unreadable', 'logo.svg', 'image/svg+xml', 0))
        ->toThrow(fn (UploadValidationException $e) => $e->errorCode === 'FILE_REQUIRED' && $e->getMessage() === 'Concept image is empty');
    // Size is checked before type.
    expect(fn () => $v->prepare('/nonexistent/unreadable', 'logo.svg', 'image/svg+xml', ConceptImageValidator::MAX_BYTES + 1))
        ->toThrow(fn (UploadValidationException $e) => $e->errorCode === 'FILE_TOO_LARGE');
})->group('uploads', 'unit');

it('trusts the client MIME, never the sniffed bytes', function () {
    expect(imgCode(imgPng(), 'logo.png', 'image/jpeg'))->toBe('INVALID_FILE_TYPE')
        ->and(imgCode(imgPng(), 'logo.png', null))->toBe('INVALID_FILE_TYPE')
        ->and(imgCode(imgPng(), 'LOGO.PNG', 'image/png'))->toBeNull(); // extension is lower-cased
})->group('uploads', 'unit');

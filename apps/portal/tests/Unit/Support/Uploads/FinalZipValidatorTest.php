<?php

use App\Support\Uploads\FinalZipValidator;
use App\Support\Uploads\PreparedUpload;
use App\Support\Uploads\UploadValidationException;

// Story 3.3 (X-12 ZIP, DV-13, ledger #108/#110): upload-validation.test.ts:134-158 and zip-validation.test.ts, ported.
// Archives are built here the way zip-validation.test.ts builds them.

/** @param list<array<string, mixed>> $entries */
function zbuild(array $entries): string
{
    $local = '';
    $central = '';
    $offset = 0;
    foreach ($entries as $e) {
        $name = $e['name'] ?? 'logo.txt';
        $lname = $e['localName'] ?? $name;
        $data = $e['data'] ?? 'logo';
        $payload = ! empty($e['deflate']) ? (string) gzdeflate($data) : $data;
        $extra = $e['extra'] ?? '';
        $size = $e['declaredSize'] ?? strlen($data);
        $crc = crc32($data);
        $d = $e['descriptor'] ?? null;
        $flags = (! empty($e['utf8']) ? 0x800 : 0) | ($d ? 8 : 0);
        $method = ! empty($e['deflate']) ? 8 : 0;
        $l = pack('VvvvvvVVVvv', 0x04034B50, 20, $flags, $method, 0, 0, $d ? 0 : $crc, $d ? 0 : strlen($payload), $d ? 0 : $size, strlen($lname), strlen($extra)).$lname.$extra;
        $desc = $d ? ($d === 'signed' ? pack('V', 0x08074B50) : '').pack('VVV', $crc, strlen($payload), $size) : '';
        $local .= $l.$payload.$desc;
        $central .= pack('VvvvvvvVVVvvvvvVV', 0x02014B50, 0x314, 20, $flags, $method, 0, 0, $crc, strlen($payload), $size, strlen($name), strlen($extra), 0, 0, 0, ($e['attrs'] ?? 0) & 0xFFFFFFFF, $offset).$name.$extra;
        $offset += strlen($l) + strlen($payload) + strlen($desc);
    }

    return $local.$central.pack('VvvvvVVv', 0x06054B50, 0, 0, count($entries), count($entries), strlen($central), $offset, 0);
}

function zcode(string $bytes, string $name = 'final.zip', ?string $mime = 'application/zip'): ?string
{
    $path = tempnam(sys_get_temp_dir(), 'zip-');
    file_put_contents($path, $bytes);
    try {
        (new FinalZipValidator)->prepare($path, $name, $mime, strlen($bytes));

        return null;
    } catch (UploadValidationException $e) {
        return $e->errorCode;
    } finally {
        unlink($path);
    }
}

it('accepts stored and real deflate with and without descriptors', function (?string $d) {
    expect(zcode(zbuild([['data' => 'a reasonably sized logo payload', 'deflate' => true, 'descriptor' => $d], ['name' => 'other.txt']])))->toBeNull();
})->with([null, 'signed', 'unsigned'])->group('uploads', 'unit');

it('accepts ZIP MIME aliases but canonicalizes stored metadata', function () {
    $b = zbuild([[]]);
    $path = tempnam(sys_get_temp_dir(), 'zip-');
    file_put_contents($path, $b);
    $r = (new FinalZipValidator)->prepare($path, 'Final.ZIP', 'application/x-zip-compressed', strlen($b));
    unlink($path);
    expect($r)->toBeInstanceOf(PreparedUpload::class)
        ->and($r->contentType)->toBe('application/zip')->and($r->extension)->toBe('zip')->and($r->size)->toBe(strlen($b));
})->group('uploads', 'unit');

it('rejects spoofed MIME/name, bad signatures, malformed archives and traversal', function () {
    $z = zbuild([[]]);
    expect(zcode($z, 'final.png'))->toBe('INVALID_FILE_TYPE')
        ->and(zcode($z, 'final.zip', 'text/plain'))->toBe('INVALID_FILE_TYPE')
        ->and(zcode($z, 'final.zip', null))->toBe('INVALID_FILE_TYPE')
        ->and(zcode('PK fake'))->toBe('FILE_SIGNATURE_MISMATCH')
        ->and(zcode(substr($z, 0, -1)))->toBe('MALFORMED_ZIP')
        ->and(zcode(zbuild([['name' => '../logo.svg']])))->toBe('MALFORMED_ZIP');
})->group('uploads', 'unit');

it('applies the DV-13 cap from the declared size before reading anything', function () {
    $v = new FinalZipValidator;
    expect(fn () => $v->prepare('/nonexistent', 'f.zip', 'application/zip', 95_000_001))
        ->toThrow(fn (UploadValidationException $e) => $e->errorCode === 'FILE_TOO_LARGE' && $e->getMessage() === 'Final ZIP exceeds the 95 MB limit');
    expect(fn () => $v->prepare('/nonexistent', 'f.png', 'text/plain', 104_857_600))->toThrow(fn (UploadValidationException $e) => $e->errorCode === 'FILE_TOO_LARGE');
    expect(fn () => $v->prepare('/nonexistent', 'f.zip', 'application/zip', 0))
        ->toThrow(fn (UploadValidationException $e) => $e->errorCode === 'FILE_REQUIRED' && $e->getMessage() === 'Final ZIP is empty');
})->group('uploads', 'unit');

it('rejects deflate bombs even with a false small declaration', function () {
    expect(zcode(zbuild([['deflate' => true, 'data' => str_repeat('A', 2 * 1024 * 1024), 'declaredSize' => 1]])))->not->toBeNull()
        ->and(zcode(zbuild([['deflate' => true, 'data' => str_repeat('A', 2 * 1024 * 1024)]])))->toBe('ZIP_LIMIT_EXCEEDED');
})->group('uploads', 'unit');

it('rejects unsafe aliases, path extras, special files, collisions and bad payloads', function () {
    foreach (['../x', 'a\\b', 'C:x', 'x. ', 'NUL.txt', 'a//b', 'a/./b', 'a/../b', "\u{FF45}vil.txt", "e\u{301}.txt"] as $name) {
        expect(zcode(zbuild([['name' => $name, 'utf8' => true]])))->toBe('MALFORMED_ZIP', $name);
    }
    expect(zcode(zbuild([['extra' => "up\x01\x00\x01"]])))->toBe('MALFORMED_ZIP');
    foreach ([0xA000, 0x1000, 0x2000, 0x6000, 0xC000] as $mode) {
        expect(zcode(zbuild([['attrs' => $mode * 65536]])))->toBe('MALFORMED_ZIP');
    }
    expect(zcode(zbuild([['name' => 'Logo.txt'], ['name' => 'logo.TXT']])))->toBe('MALFORMED_ZIP')
        ->and(zcode(zbuild([['name' => 'a'], ['name' => 'a/b']])))->toBe('MALFORMED_ZIP')
        ->and(zcode(zbuild([['declaredSize' => 1]])))->toBe('MALFORMED_ZIP')
        ->and(zcode(zbuild([['name' => 'café.txt', 'utf8' => true]])))->toBeNull()
        ->and(zcode(zbuild([['name' => "caf\x82.txt"]])))->toBeNull();
    $corrupt = zbuild([[]]);
    $corrupt[30 + 8] = chr(ord($corrupt[30 + 8]) ^ 1);
    expect(zcode($corrupt))->toBe('MALFORMED_ZIP');
})->group('uploads', 'unit');

<?php

namespace App\Support\Uploads\Zip;

use App\Support\Uploads\UploadValidationException;

/**
 * Ranged, read-only access to the uploaded file (fseek/fread), so a 95 MB archive is never held in memory
 * (story 3.3, open question 3). Integers are little-endian, like the DataView reads in zip-validation.ts.
 * A read outside the file is a MALFORMED_ZIP (Next would throw a RangeError there; the corpus has no such case).
 */
final class ZipFile
{
    /** @var resource */
    private $handle;

    public function __construct(string $path, public readonly int $length)
    {
        $h = fopen($path, 'rb');
        if ($h === false) {
            throw new \RuntimeException("Cannot read the uploaded file at {$path}");
        }
        $this->handle = $h;
    }

    public function __destruct()
    {
        fclose($this->handle);
    }

    public function read(int $offset, int $length): string
    {
        if ($length === 0) {
            return '';
        }
        if ($offset < 0 || $length < 0 || $offset + $length > $this->length || fseek($this->handle, $offset) !== 0) {
            throw new UploadValidationException('MALFORMED_ZIP', 'Read outside the archive');
        }
        $data = '';
        while (strlen($data) < $length) {
            $chunk = fread($this->handle, max(1, $length - strlen($data)));
            if ($chunk === false || $chunk === '') {
                throw new UploadValidationException('MALFORMED_ZIP', 'Read outside the archive');
            }
            $data .= $chunk;
        }

        return $data;
    }

    public function u16(int $offset): int
    {
        /** @var array{1: int} $u */
        $u = unpack('v', $this->read($offset, 2));

        return $u[1];
    }

    public function u32(int $offset): int
    {
        /** @var array{1: int} $u */
        $u = unpack('V', $this->read($offset, 4));

        return $u[1];
    }
}

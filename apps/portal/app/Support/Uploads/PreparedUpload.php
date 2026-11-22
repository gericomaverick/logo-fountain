<?php

namespace App\Support\Uploads;

/** A validated upload: the temp file (a path, never the bytes: a 95 MB ZIP must not sit in memory twice) and its canonical metadata. */
final readonly class PreparedUpload
{
    public function __construct(
        public string $path,
        public string $extension,
        public string $contentType,
        public int $size,
    ) {}
}

<?php

namespace App\Support\Storage;

use RuntimeException;

/** A private object already exists at the key (HTTP 412 from the conditional PUT). Carries no key, URL or secret. */
final class ObjectKeyCollision extends RuntimeException
{
    public function __construct(?\Throwable $previous = null)
    {
        parent::__construct('Private object key already exists', 0, $previous);
    }
}

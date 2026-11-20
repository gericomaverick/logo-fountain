<?php

namespace App\Domain;

use App\Support\ErrorCodes;
use RuntimeException;

/** No valid canonical origin (`lib/request-origin.ts:1-8`, PublicSiteConfigurationError). */
final class PublicSiteUrlRequired extends RuntimeException
{
    public const CODE = ErrorCodes::PUBLIC_SITE_URL_REQUIRED;

    public function __construct()
    {
        parent::__construct('A valid canonical PUBLIC_SITE_URL is required for security-sensitive redirects.');
    }
}

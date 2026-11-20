<?php

namespace App\Http;

use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\ResponseHeaderBag;

/**
 * Symfony appends ", private" to any Cache-Control without public/private/s-maxage, so
 * `no-store` would be sent as `no-store, private`. Next sends exactly `no-store` (the parity
 * suite asserts the exact value), so a no-store Cache-Control is kept verbatim here.
 */
final class RawCacheControlHeaderBag extends ResponseHeaderBag
{
    /** Sends `Cache-Control: no-store` exactly, keeping every other header and cookie. */
    public static function noStore(Response $response): void
    {
        if (! $response->headers instanceof self) {
            $old = $response->headers;
            $bag = new self;
            foreach ($old->allPreserveCaseWithoutCookies() as $name => $values) {
                $bag->set($name, $values);
            }
            foreach ($old->getCookies() as $cookie) {
                $bag->setCookie($cookie);
            }
            $response->headers = $bag;
        }
        $response->headers->set('Cache-Control', 'no-store');
    }

    protected function computeCacheControlValue(): string
    {
        // The raw directives just set (hasCacheControlDirective() reads the previous computed value).
        if (array_key_exists('no-store', $this->cacheControl)) {
            return $this->getCacheControlHeader();
        }

        return parent::computeCacheControlValue();
    }
}

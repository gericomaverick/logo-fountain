<?php

namespace App\Domain;

use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Exception\SuspiciousOperationException;

/**
 * X-04: the canonical origin for the Origin guard and for every emailed link.
 * Port of `getSecuritySensitivePublicOrigin` (`apps/web/src/lib/request-origin.ts:115-141`).
 *
 * - PUBLIC_SITE_URL set: it must be an http(s) URL without credentials; its origin is used.
 *   Production accepts only https.
 * - Unset, outside production: the request's own origin if its host is loopback; with no request,
 *   the APP_URL origin when that is loopback, otherwise http://localhost:3000.
 * - Production never reads the request, Host or forwarded headers.
 */
final readonly class CanonicalOrigin
{
    private const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

    private const DEFAULT_LOCAL_ORIGIN = 'http://localhost:3000';

    public function __construct(
        private ?string $configured,
        private bool $production,
        private ?string $appUrl = null,
    ) {}

    public static function fromConfig(): self
    {
        $configured = config('portal.public_site_url');
        $appUrl = config('app.url');

        return new self(
            is_string($configured) ? $configured : null,
            app()->isProduction(),
            is_string($appUrl) ? $appUrl : null,
        );
    }

    /** @throws PublicSiteUrlRequired */
    public function resolve(?Request $request = null): string
    {
        if ($this->configured !== null && $this->configured !== '') {
            $url = self::parse($this->configured);
            if ($url === null) {
                throw new PublicSiteUrlRequired;
            }
            if (! $this->production || $url['scheme'] === 'https') {
                return $url['origin'];
            }
            throw new PublicSiteUrlRequired;
        }

        if (! $this->production) {
            if ($request === null) {
                $app = $this->appUrl === null ? null : self::parse($this->appUrl);

                return $app !== null && self::isLoopback($app['host']) ? $app['origin'] : self::DEFAULT_LOCAL_ORIGIN;
            }
            $origin = self::requestLoopbackOrigin($request);
            if ($origin !== null) {
                return $origin;
            }
        }

        throw new PublicSiteUrlRequired;
    }

    /**
     * Parse an absolute http(s) URL without credentials into its origin (WHATWG `URL.origin` for the
     * cases that matter here: lowercase scheme and host, default port dropped). Null when invalid.
     *
     * @return array{scheme: 'http'|'https', host: string, origin: string}|null
     */
    public static function parse(string $value): ?array
    {
        $value = trim($value);
        // WHATWG would strip or reject these; refusing them outright is the safe reading.
        if ($value === '' || preg_match('/[\x00-\x20\x7f\\\\]/', $value) === 1) {
            return null;
        }
        $parts = parse_url($value);
        if ($parts === false || ! isset($parts['scheme'], $parts['host'])) {
            return null;
        }
        $scheme = strtolower($parts['scheme']);
        if (($scheme !== 'http' && $scheme !== 'https') || ! str_starts_with(strtolower($value), $scheme.'://')) {
            return null;
        }
        if (($parts['user'] ?? '') !== '' || ($parts['pass'] ?? '') !== '') {
            return null;
        }
        $host = self::normaliseHost($parts['host']);
        if ($host === null) {
            return null;
        }
        $port = $parts['port'] ?? null;
        $default = $scheme === 'https' ? 443 : 80;
        $origin = $scheme.'://'.$host.($port === null || $port === $default ? '' : ':'.$port);

        return ['scheme' => $scheme, 'host' => $host, 'origin' => $origin];
    }

    private static function normaliseHost(string $host): ?string
    {
        $host = strtolower($host);
        if (str_starts_with($host, '[')) {
            $inner = substr($host, 1, -1);

            return str_ends_with($host, ']') && filter_var($inner, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6) !== false ? $host : null;
        }
        if (preg_match('/[^\x00-\x7f]/', $host) === 1) {
            $ascii = function_exists('idn_to_ascii') ? idn_to_ascii($host, IDNA_DEFAULT, INTL_IDNA_VARIANT_UTS46) : false;
            if ($ascii === false) {
                return null;
            }
            $host = strtolower($ascii);
        }

        return preg_match('/^[a-z0-9_-]+(\.[a-z0-9_-]+)*\.?$/D', $host) === 1 ? $host : null;
    }

    private static function isLoopback(string $host): bool
    {
        return in_array($host, self::LOOPBACK_HOSTS, true);
    }

    private static function requestLoopbackOrigin(Request $request): ?string
    {
        try {
            $host = $request->getHost();
            $scheme = $request->getScheme();
        } catch (SuspiciousOperationException) {
            return null;
        }
        if (! self::isLoopback($host) || ($scheme !== 'http' && $scheme !== 'https')) {
            return null;
        }

        return $request->getSchemeAndHttpHost();
    }
}

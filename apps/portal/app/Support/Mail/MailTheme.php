<?php

declare(strict_types=1);

namespace App\Support\Mail;

/**
 * Inline-style values for the lifecycle mail layout. Mail clients ignore CSS variables, so the
 * values live here (PHP, outside the design lint's scope) rather than in the Blade view.
 *
 * These are the ORIGINAL mail palette and sizes, unchanged from before a7d69cb. Story 4.4 (N-14,
 * email branding) moves them to the app.css tokens; until then the restyle is the owner's call
 * (see DECISIONS). Sizes are the mail-safe pixel values for the steps sm, base, 2xl.
 */
final class MailTheme
{
    private const COLOURS = [
        'bg' => '#f8f7ff',
        'fg' => '#1d1330',
        'surface' => '#ffffff',
        'divider' => '#ebe7ff',
        'accent' => '#5b38f0',
        'accent-fg' => '#ffffff',
        'fg-2' => '#43355f',
        'fg-3' => '#6f6590',
    ];

    public static function colour(string $token): string
    {
        return self::COLOURS[$token] ?? throw new \RuntimeException("Mail colour {$token} not defined");
    }

    public static function size(string $step): string
    {
        return ['sm' => '13px', 'base' => '16px', '2xl' => '24px'][$step];
    }

    /**
     * Next's `resolveEmailLogoUrl` (`email-branding.ts:53-60`): an explicit https EMAIL_LOGO_URL, else `/img/logo.svg`
     * on the configured public origin unless that is loopback, else an embedded fallback (the same wordmark as Next).
     */
    public static function logoUrl(): string
    {
        $explicit = self::absolute(config('portal.email_logo_url'), false);
        if ($explicit !== null) {
            return $explicit;
        }
        $origin = config('portal.public_site_url');
        $host = is_string($origin) ? strtolower((string) parse_url($origin, PHP_URL_HOST)) : '';
        if ($host !== '' && ! in_array($host, ['localhost', '127.0.0.1', '[::1]', '::1'], true)) {
            $url = self::absolute(rtrim((string) $origin, '/').'/img/logo.svg', false);
            if ($url !== null) {
                return $url;
            }
        }
        $svg = "<svg xmlns='http://www.w3.org/2000/svg' width='240' height='34' viewBox='0 0 240 34' role='img' aria-label='Logo Fountain'><rect width='240' height='34' rx='8' fill='#f4f0ff'/><text x='12' y='23' font-family='Arial,sans-serif' font-size='16' font-weight='700' fill='#1d1330'>Logo Fountain</text></svg>";

        return 'data:image/svg+xml;utf8,'.rawurlencode($svg);
    }

    /** Next's `requireSafeCtaUrl`: absolute https (loopback http outside production), no credentials, no control characters. */
    public static function safeUrl(string $url): string
    {
        return self::absolute($url, ! app()->isProduction())
            ?? throw new \InvalidArgumentException('Transactional email CTA URL must be an absolute HTTPS URL');
    }

    private static function absolute(mixed $value, bool $allowLoopbackHttp): ?string
    {
        if (! is_string($value) || $value === '' || preg_match('/[\x00-\x1f\x7f]/', $value) === 1) {
            return null;
        }
        $parts = parse_url($value);
        if ($parts === false || ! isset($parts['host']) || isset($parts['user']) || isset($parts['pass'])) {
            return null;
        }
        $loopback = in_array(strtolower($parts['host']), ['localhost', '127.0.0.1', '[::1]'], true);
        $scheme = $parts['scheme'] ?? '';

        return $scheme === 'https' || ($allowLoopbackHttp && $scheme === 'http' && $loopback) ? $value : null;
    }
}

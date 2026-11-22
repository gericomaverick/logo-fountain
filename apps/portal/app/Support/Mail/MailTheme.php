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
}

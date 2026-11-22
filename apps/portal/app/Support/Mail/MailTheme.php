<?php

declare(strict_types=1);

namespace App\Support\Mail;

/**
 * Inline-style values for the lifecycle mail layout. Mail clients ignore CSS variables, so the
 * colours are read from the design tokens in resources/css/app.css (light theme, first
 * definition) instead of being written into the Blade view; sizes are mail-safe pixel values
 * matching the type scale steps (xs, sm, base, 2xl).
 */
final class MailTheme
{
    /** @var array<string, string>|null */
    private static ?array $colours = null;

    public static function colour(string $token): string
    {
        self::$colours ??= self::load();

        return self::$colours[$token] ?? throw new \RuntimeException("Design token --color-{$token} not found");
    }

    /** @return array<string, string> */
    private static function load(): array
    {
        $css = (string) file_get_contents(resource_path('css/app.css'));
        preg_match_all('/^\s*--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8});/m', $css, $m, PREG_SET_ORDER);
        $out = [];
        foreach ($m as $row) {
            $out[$row[1]] ??= $row[2];
        }

        return $out;
    }

    public static function size(string $step): string
    {
        return ['sm' => '13px', 'base' => '16px', '2xl' => '24px'][$step];
    }
}

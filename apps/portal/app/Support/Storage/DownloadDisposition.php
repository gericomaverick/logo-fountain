<?php

namespace App\Support\Storage;

use Normalizer;

/** `safeDownloadDisposition` (r2.ts:32-40): a Content-Disposition value that cannot inject headers or paths. */
final class DownloadDisposition
{
    public const DEFAULT_NAME = 'final-deliverables.zip';

    public static function for(string $input = self::DEFAULT_NAME): string
    {
        // Invalid UTF-8 (the PHP analogue of a lone surrogate) becomes U+FFFD before anything else.
        $previous = mb_substitute_character();
        mb_substitute_character(0xFFFD);
        $input = mb_scrub($input, 'UTF-8');
        mb_substitute_character($previous);
        $normalized = Normalizer::normalize($input, Normalizer::FORM_C);
        $normalized = is_string($normalized) ? $normalized : $input;
        $cleaned = (string) preg_replace('/[\x00-\x1f\x7f-\x9f\/\\\\";\x{2028}\x{2029}]/u', '_', $normalized);
        $cleaned = (string) preg_replace('/^[\s\p{Z}\x{FEFF}]+|[\s\p{Z}\x{FEFF}]+$/u', '', mb_substr($cleaned, 0, 160, 'UTF-8'));
        if ($cleaned === '') {
            $cleaned = self::DEFAULT_NAME;
        }

        // JS replaces per UTF-16 unit, so an astral character becomes two underscores.
        $ascii = (string) preg_replace('/[^\x20-\x7e]/u', '_', (string) preg_replace('/[\x{10000}-\x{10FFFF}]/u', '__', $cleaned));
        $encoded = strtr(rawurlencode($cleaned), ['%21' => '!', "'" => '%27', '(' => '%28', ')' => '%29', '*' => '%2A']);

        return "attachment; filename=\"{$ascii}\"; filename*=UTF-8''{$encoded}";
    }
}

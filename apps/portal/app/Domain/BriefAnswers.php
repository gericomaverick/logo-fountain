<?php

namespace App\Domain;

/**
 * Port of Next's `normalizeBriefAnswers` / `parseBriefAnswers` (`lib/brief.ts:306-375`): a stored brief's answers as the
 * sixteen trimmed, length-capped strings, or null when the three required ones are missing. Lengths count characters,
 * not UTF-16 units as JS does (differs only for astral characters).
 */
final class BriefAnswers
{
    private const array LIMITS = [
        'brandName' => 120, 'tagline' => 140, 'industry' => 120, 'offerSummary' => 700, 'audiencePrimary' => 500,
        'audienceSecondary' => 400, 'businessGoals' => 500, 'brandPersonality' => 400, 'styleDirection' => 700,
        'colorPreferences' => 400, 'mustInclude' => 450, 'avoidanceNotes' => 450, 'usageContexts' => 500,
        'deliverablesContext' => 400, 'competitors' => 500, 'additionalNotes' => 500,
    ];

    /** @return array<string, string>|null */
    public static function parse(mixed $value): ?array
    {
        if (is_object($value)) {
            $value = (array) $value;
        }
        if (! is_array($value) || array_is_list($value) && $value !== []) {
            return null;
        }
        $next = [];
        foreach (self::LIMITS as $key => $max) {
            $next[$key] = self::clean($value[$key] ?? null, $max);
        }
        // Backward compatibility for the v1 brief shape.
        if ($next['offerSummary'] === '') {
            $next['offerSummary'] = self::clean($value['description'] ?? null, 700);
        }
        if ($next['styleDirection'] === '') {
            $next['styleDirection'] = self::clean($value['styleNotes'] ?? null, 700);
        }

        return $next['brandName'] === '' || $next['industry'] === '' || $next['offerSummary'] === '' ? null : $next;
    }

    private static function clean(mixed $value, int $max): string
    {
        if (! is_string($value)) {
            return '';
        }
        $trimmed = preg_replace('/^[\s\x{FEFF}\p{Z}]+|[\s\x{FEFF}\p{Z}]+$/u', '', $value) ?? $value;

        return mb_substr($trimmed, 0, $max);
    }
}

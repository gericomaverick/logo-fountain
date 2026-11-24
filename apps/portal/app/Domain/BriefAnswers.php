<?php

namespace App\Domain;

/**
 * Port of Next's `normalizeBriefAnswers` / `parseBriefAnswers` (`lib/brief.ts:306-375`): a stored brief's answers as the
 * sixteen trimmed, length-capped strings, or null when the three required ones are missing. Lengths count characters,
 * not UTF-16 units as JS does (differs only for astral characters).
 */
final class BriefAnswers
{
    private const array REQUIRED = ['brandName', 'industry', 'offerSummary', 'audiencePrimary', 'businessGoals', 'brandPersonality', 'styleDirection', 'usageContexts'];

    private const array LIMITS = [
        'brandName' => 120, 'tagline' => 140, 'industry' => 120, 'offerSummary' => 700, 'audiencePrimary' => 500,
        'audienceSecondary' => 400, 'businessGoals' => 500, 'brandPersonality' => 400, 'styleDirection' => 700,
        'colorPreferences' => 400, 'mustInclude' => 450, 'avoidanceNotes' => 450, 'usageContexts' => 500,
        'deliverablesContext' => 400, 'competitors' => 500, 'additionalNotes' => 500,
    ];

    /**
     * `normalizeBriefAnswers`: the sixteen cleaned strings, or null when the value is not an object. Required fields may be empty (drafts).
     *
     * @return array<string, string>|null
     */
    public static function normalize(mixed $value): ?array
    {
        if (is_object($value)) {
            $value = (array) $value;
        }
        if (! is_array($value)) {
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

        return $next;
    }

    /**
     * `parseBriefAnswers`: normalised, or null when brandName, industry or offerSummary is empty.
     *
     * @return array<string, string>|null
     */
    public static function parse(mixed $value): ?array
    {
        $next = self::normalize($value);

        return $next === null || $next['brandName'] === '' || $next['industry'] === '' || $next['offerSummary'] === '' ? null : $next;
    }

    /**
     * The required fields still empty (`missingRequiredFields`).
     *
     * @param  array<string, string>  $answers
     * @return list<string>
     */
    public static function missing(array $answers): array
    {
        return array_values(array_filter(self::REQUIRED, fn (string $k) => ($answers[$k] ?? '') === ''));
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

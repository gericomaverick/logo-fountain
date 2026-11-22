<?php

namespace App\Support;

use DateTimeImmutable;
use DateTimeInterface;
use DateTimeZone;

/** `{brand-slug}-{YYYY-MM-DD, UTC}.zip` (final-deliverable-filename.ts:34-50, X-11). */
final class FinalDeliverableFilename
{
    public static function build(?string $company, ?string $clientName, ?string $email, DateTimeInterface $createdAt): string
    {
        $slug = self::slug($company) ?? self::slug($clientName) ?? self::slug(self::localPart($email)) ?? 'logo-fountain';
        $date = DateTimeImmutable::createFromInterface($createdAt)->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d');

        return "{$slug}-{$date}.zip";
    }

    private static function slug(?string $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        $slug = trim((string) preg_replace('/[^a-z0-9]+/', '-', mb_strtolower(trim($value))), '-');

        return $slug === '' ? null : $slug;
    }

    private static function localPart(?string $email): ?string
    {
        if ($email === null || $email === '') {
            return null;
        }
        $local = trim(explode('@', $email)[0]);

        return $local === '' ? null : $local;
    }
}

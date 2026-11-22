<?php

namespace App\Support\Storage;

use App\Models\FileAsset;
use DateTimeImmutable;
use DateTimeZone;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * DV-12 / ADR-021, server half: turns a stored image into `{imageKey, url, expiresAt}` for the UI's
 * `stableImage()` (resources/js/lib/media.ts). Payload builders call this; they never build the key.
 * Never throws; never stores or logs the URL (X-11).
 */
final class SignedImage
{
    public const TTL_SECONDS = 3600;

    /**
     * @return array{imageKey: string, url: string, expiresAt: int}|null null = "Preview unavailable"
     */
    public static function for(?FileAsset $asset, ?PrivateStorage $storage = null): ?array
    {
        if ($asset === null) {
            return null;
        }
        try {
            $url = ($storage ?? PrivateStorage::fromConfig())->sign($asset->bucket, $asset->path, self::TTL_SECONDS);
            $expiresAt = self::expiryMillis($url);

            return ['imageKey' => self::key($asset), 'url' => $url, 'expiresAt' => $expiresAt];
        } catch (Throwable $e) {
            // The class only: a message could carry the URL or configuration values.
            Log::warning('Image signing failed', ['exception' => $e::class]);

            return null;
        }
    }

    /** Stable while the bytes are: object paths are random and immutable, so bucket|path identifies them. */
    public static function key(FileAsset $asset): string
    {
        return substr(hash('sha256', $asset->bucket.'|'.$asset->path), 0, 32);
    }

    /** X-Amz-Date + X-Amz-Expires in epoch ms, as media.ts signedUrlExpiry() reads it (never now() + ttl). */
    private static function expiryMillis(string $url): int
    {
        parse_str((string) parse_url($url, PHP_URL_QUERY), $q);
        $date = is_string($q['X-Amz-Date'] ?? null) ? $q['X-Amz-Date'] : '';
        $expires = is_string($q['X-Amz-Expires'] ?? null) ? (int) $q['X-Amz-Expires'] : 0;
        $start = DateTimeImmutable::createFromFormat('Ymd\THis\Z', $date, new DateTimeZone('UTC'));
        if ($start === false || $expires <= 0) {
            throw new \UnexpectedValueException('Signed URL has no readable expiry');
        }

        return ($start->getTimestamp() + $expires) * 1000;
    }
}

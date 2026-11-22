<?php

namespace Tests\Support;

use App\Support\Storage\PrivateStorage;
use Aws\S3\S3Client;

/** Builds PrivateStorage for tests: against the local SeaweedFS (L3) or an SDK mock handler (L1). */
final class StorageTestClient
{
    public const CONCEPTS = 'portal-concepts';

    public const FINALS = 'portal-finals';

    /** @return array<string, mixed> */
    public static function options(?callable $handler = null, string $endpoint = 'https://acct.r2.cloudflarestorage.com'): array
    {
        return array_filter([
            'region' => 'auto',
            'version' => 'latest',
            'endpoint' => $endpoint,
            'use_path_style_endpoint' => true,
            'credentials' => ['key' => 'dev-only-access-key', 'secret' => 'dev-only-secret-key'],
            'request_checksum_calculation' => 'when_required',
            'response_checksum_validation' => 'when_required',
            'retries' => 2,
            'handler' => $handler,
        ], fn ($v) => $v !== null);
    }

    public static function seaweedEndpoint(): string
    {
        return getenv('PORTAL_TEST_S3_ENDPOINT') ?: 'http://seaweedfs:8333';
    }

    public static function seaweed(string $concepts = self::CONCEPTS, string $finals = self::FINALS): PrivateStorage
    {
        return new PrivateStorage(new S3Client(self::options(null, self::seaweedEndpoint())), $concepts, $finals);
    }
}

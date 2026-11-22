<?php

namespace App\Support\Storage;

use App\Support\InvalidConfiguration;
use Aws\Exception\AwsException;
use Aws\S3\S3Client;
use InvalidArgumentException;
use Throwable;

/**
 * The private object store (ADR-016, X-10): the AWS SDK for PHP against R2 (SeaweedFS locally).
 * Objects are written once (conditional PUT, never overwritten), read only through short presigned URLs.
 * Callers build the key and recheck authorisation; this class validates and writes the key it is given.
 * Never logs or stores a presigned URL or the secret key.
 */
final class PrivateStorage
{
    public const CONCEPTS = 'concepts';

    public const FINAL_DELIVERABLES = 'final-deliverables';

    /** @var array<string, string> */
    private array $buckets;

    public function __construct(private readonly S3Client $client, string $conceptsBucket, string $finalDeliverablesBucket)
    {
        foreach ([$conceptsBucket, $finalDeliverablesBucket] as $bucket) {
            if (preg_match('/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/D', $bucket) !== 1) {
                throw new InvalidConfiguration('Invalid private bucket configuration');
            }
        }
        if ($conceptsBucket === $finalDeliverablesBucket) {
            throw new InvalidConfiguration('Private storage namespaces require distinct buckets');
        }
        $this->buckets = [self::CONCEPTS => $conceptsBucket, self::FINAL_DELIVERABLES => $finalDeliverablesBucket];
    }

    public static function fromConfig(): self
    {
        /** @var array<string, mixed> $c */
        $c = (array) config('portal.r2');
        $required = function (string $key, string $env) use ($c): string {
            $value = is_string($c[$key] ?? null) ? trim($c[$key]) : '';
            if ($value === '') {
                throw new InvalidConfiguration("Missing private storage configuration: {$env}");
            }

            return $value;
        };
        $account = $required('account_id', 'R2_ACCOUNT_ID');
        if (preg_match('/^[a-f0-9]{32}$/D', $account) !== 1) {
            throw new InvalidConfiguration('Invalid R2 account ID');
        }
        $jurisdiction = is_string($c['jurisdiction'] ?? null) ? trim($c['jurisdiction']) : '';
        if ($jurisdiction !== '' && $jurisdiction !== 'eu' && $jurisdiction !== 'fedramp') {
            throw new InvalidConfiguration('Invalid R2 jurisdiction');
        }
        $override = is_string($c['endpoint'] ?? null) ? trim($c['endpoint']) : '';
        $endpoint = $override !== '' ? $override : 'https://'.$account.($jurisdiction !== '' ? ".{$jurisdiction}" : '').'.r2.cloudflarestorage.com';

        $client = new S3Client([
            'region' => 'auto',
            'version' => 'latest',
            'endpoint' => $endpoint,
            'use_path_style_endpoint' => $override !== '',
            'credentials' => [
                'key' => $required('access_key_id', 'R2_ACCESS_KEY_ID'),
                'secret' => $required('secret_access_key', 'R2_SECRET_ACCESS_KEY'),
            ],
            'request_checksum_calculation' => 'when_required',
            'response_checksum_validation' => 'when_required',
            'retries' => 2,
        ]);

        return new self($client, $required('concepts_bucket', 'R2_CONCEPTS_BUCKET'), $required('final_deliverables_bucket', 'R2_FINAL_DELIVERABLES_BUCKET'));
    }

    /**
     * Writes one new object. There is no overwrite path.
     *
     * @param  array{path: string, extension: string, contentType: string, size: int}  $file  a 3.2 PreparedUpload's four fields
     * @return array{bucket: string, path: string, mime: string, size: int}
     *
     * @throws ObjectKeyCollision when the key exists (HTTP 412)
     */
    public function upload(string $namespace, string $key, array $file): array
    {
        $bucket = $this->bucket($namespace);
        $key = self::objectKey($key);
        $md5 = hash_file('md5', $file['path'], true);
        $sha256 = hash_file('sha256', $file['path']);
        $body = fopen($file['path'], 'rb');
        if ($md5 === false || $sha256 === false || $body === false) {
            throw new InvalidArgumentException('Upload file is not readable');
        }
        try {
            $this->client->putObject([
                'Bucket' => $bucket,
                'Key' => $key,
                'Body' => $body,
                'ContentType' => $file['contentType'],
                'ContentLength' => $file['size'],
                'CacheControl' => 'private, max-age=3600',
                'IfNoneMatch' => '*',
                'ContentMD5' => base64_encode($md5),
                'Metadata' => ['sha256' => $sha256],
            ]);
        } catch (AwsException $e) {
            if ($e->getAwsErrorCode() === 'PreconditionFailed' || $e->getStatusCode() === 412) {
                throw new ObjectKeyCollision($e);
            }
            throw $e;
        } finally {
            if (is_resource($body)) {
                fclose($body);
            }
        }

        return ['bucket' => $namespace, 'path' => $key, 'mime' => $file['contentType'], 'size' => $file['size']];
    }

    /** A SigV4 GET URL. Never log or persist it. */
    public function sign(string $namespace, string $key, mixed $expiresIn = 3600, ?string $downloadFileName = null): string
    {
        $bucket = $this->bucket($namespace);
        $key = self::objectKey($key);
        $ttl = SignedUrlExpiry::check($expiresIn);
        $args = ['Bucket' => $bucket, 'Key' => $key];
        if ($downloadFileName !== null) {
            $args['ResponseContentDisposition'] = DownloadDisposition::for($downloadFileName);
        }
        $request = $this->client->createPresignedRequest($this->client->getCommand('GetObject', $args), "+{$ttl} seconds");

        return (string) $request->getUri();
    }

    /** @return list<array{bucket: string, passed: bool}> */
    public function health(): array
    {
        $results = [];
        foreach ($this->buckets as $namespace => $bucket) {
            try {
                $this->client->headBucket(['Bucket' => $bucket]);
                $results[] = ['bucket' => $namespace, 'passed' => true];
            } catch (Throwable) {
                $results[] = ['bucket' => $namespace, 'passed' => false];
            }
        }

        return $results;
    }

    /**
     * Caller-only cleanup; nothing calls it automatically.
     *
     * @param  list<array{bucket: string, path: string}>  $files
     * @return array{attempted: int, deleted: int, failures: list<array{bucket: string, message: string}>}
     */
    public function remove(array $files): array
    {
        $deleted = 0;
        $failures = [];
        foreach ($files as $file) {
            try {
                $this->client->deleteObject(['Bucket' => $this->bucket($file['bucket']), 'Key' => self::objectKey($file['path'])]);
                $deleted++; // S3 delete is idempotent: count acknowledged requests, not existence.
            } catch (Throwable) {
                $failures[] = ['bucket' => $file['bucket'], 'message' => 'Private object deletion was not confirmed'];
            }
        }

        return ['attempted' => count($files), 'deleted' => $deleted, 'failures' => $failures];
    }

    public static function objectKey(string $value): string
    {
        if ($value === '' || strlen($value) > 1024 || $value[0] === '/' || preg_match('/[\x00-\x1f\x7f\\\\]/', $value) === 1
            || array_filter(explode('/', $value), fn (string $p): bool => $p === '' || $p === '.' || $p === '..') !== []) {
            throw new InvalidArgumentException('Invalid private object key');
        }

        return $value;
    }

    private function bucket(string $namespace): string
    {
        return $this->buckets[$namespace] ?? throw new InvalidArgumentException('Unknown private storage namespace');
    }
}

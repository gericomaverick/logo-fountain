<?php

use App\Support\InvalidConfiguration;
use App\Support\Storage\ObjectKeyCollision;
use App\Support\Storage\PrivateStorage;
use Aws\Command;
use Aws\CommandInterface;
use Aws\Exception\AwsException;
use Aws\MockHandler;
use Aws\Result;
use Aws\S3\S3Client;
use GuzzleHttp\Psr7\Response;
use Tests\Support\StorageTestClient as T;

// Story 3.1 (X-10, ledger #106 cases 1-7): the SDK MockHandler, no network.

function psMockStorage(MockHandler $mock): PrivateStorage
{
    return new PrivateStorage(new S3Client(T::options($mock)), 'concepts-bkt', 'finals-bkt');
}

function psTmpFile(string $body): string
{
    $p = tempnam(sys_get_temp_dir(), 'ps');
    file_put_contents($p, $body);

    return $p;
}

function psS3Error(string $code, int $status): AwsException
{
    return new AwsException($code, new Command('PutObject'), ['code' => $code, 'response' => new Response($status)]);
}

it('writes with a conditional PUT carrying md5 and sha256', function () {
    $seen = null;
    $mock = new MockHandler([function (CommandInterface $cmd) use (&$seen) {
        $seen = $cmd->toArray();
        $seen['_body'] = is_resource($seen['Body']) ? stream_get_contents($seen['Body'], -1, 0) : 'not a stream';

        return new Result([]);
    }]);
    $file = psTmpFile('hello');
    $out = psMockStorage($mock)->upload('concepts', 'p/c/v1.x.png', ['path' => $file, 'extension' => 'png', 'contentType' => 'image/png', 'size' => 5]);

    expect($out)->toBe(['bucket' => 'concepts', 'path' => 'p/c/v1.x.png', 'mime' => 'image/png', 'size' => 5])
        ->and($seen['Bucket'])->toBe('concepts-bkt')
        ->and($seen['IfNoneMatch'])->toBe('*')
        ->and($seen['CacheControl'])->toBe('private, max-age=3600')
        ->and($seen['ContentMD5'])->toBe(base64_encode(md5('hello', true)))
        ->and($seen['Metadata'])->toBe(['sha256' => hash('sha256', 'hello')])
        ->and($seen['ContentLength'])->toBe(5)
        ->and($seen['_body'])->toBe('hello');
});

it('maps a 412 to ObjectKeyCollision after exactly one call, never retrying', function () {
    $calls = 0;
    $mock = new MockHandler([function () use (&$calls) {
        $calls++;

        return psS3Error('PreconditionFailed', 412);
    }, fn () => new Result([])]);
    $file = psTmpFile('x');
    expect(fn () => psMockStorage($mock)->upload('concepts', 'k', ['path' => $file, 'extension' => 'png', 'contentType' => 'image/png', 'size' => 1]))
        ->toThrow(ObjectKeyCollision::class);
    expect($calls)->toBe(1)->and($mock->count())->toBe(1);
});

it('validates the key and namespace before any call', function () {
    $mock = new MockHandler([]);
    $s = psMockStorage($mock);
    $f = ['path' => psTmpFile('x'), 'extension' => 'png', 'contentType' => 'image/png', 'size' => 1];
    expect(fn () => $s->upload('concepts', '/bad', $f))->toThrow(InvalidArgumentException::class, 'Invalid private object key')
        ->and(fn () => $s->upload('nope', 'k', $f))->toThrow(InvalidArgumentException::class, 'Unknown private storage namespace');
});

it('presigns a SigV4 URL with the ttl and an optional signed disposition', function () {
    $s = psMockStorage(new MockHandler([]));
    $url = $s->sign('final-deliverables', 'p/finals/a.zip', 600, 'Acme.zip');
    parse_str((string) parse_url($url, PHP_URL_QUERY), $q);
    expect($q['X-Amz-Algorithm'])->toBe('AWS4-HMAC-SHA256')->and($q['X-Amz-Expires'])->toBe('600')
        ->and($q['X-Amz-Signature'])->toMatch('/^[a-f0-9]{64}$/')
        ->and($q['response-content-disposition'])->toContain('filename="Acme.zip"')
        ->and($url)->toContain('/finals-bkt/p/finals/a.zip');
    parse_str((string) parse_url($s->sign('concepts', 'k'), PHP_URL_QUERY), $plain);
    expect($plain['X-Amz-Expires'])->toBe('3600')->and($plain)->not->toHaveKey('response-content-disposition');
});

it('rejects a bad expiry', function (mixed $ttl) {
    psMockStorage(new MockHandler([]))->sign('concepts', 'k', $ttl);
})->with([0, 3601, 1.5, '10'])->throws(InvalidArgumentException::class, 'Signed URL expiry must be');

it('remove counts acknowledged deletes and records failures without detail', function () {
    $mock = new MockHandler([new Result([]), fn () => psS3Error('AccessDenied', 403)]);
    $out = psMockStorage($mock)->remove([
        ['bucket' => 'concepts', 'path' => 'a'],
        ['bucket' => 'concepts', 'path' => 'b'],
        ['bucket' => 'other', 'path' => 'c'],
        ['bucket' => 'final-deliverables', 'path' => '../x'],
    ]);
    expect($out['attempted'])->toBe(4)->and($out['deleted'])->toBe(1)->and($out['failures'])->toHaveCount(3)
        ->and($out['failures'][0])->toBe(['bucket' => 'concepts', 'message' => 'Private object deletion was not confirmed']);
});

it('health hides errors', function () {
    $mock = new MockHandler([new Result([]), fn () => psS3Error('NoSuchBucket', 404)]);
    expect(psMockStorage($mock)->health())->toBe([['bucket' => 'concepts', 'passed' => true], ['bucket' => 'final-deliverables', 'passed' => false]]);
});

it('builds the client from config with the required options', function () {
    config(['portal.r2' => ['account_id' => str_repeat('a', 32), 'access_key_id' => 'k', 'secret_access_key' => 's',
        'concepts_bucket' => 'cbkt', 'final_deliverables_bucket' => 'fbkt', 'jurisdiction' => 'eu', 'endpoint' => null]]);
    $storage = PrivateStorage::fromConfig();
    $client = (fn () => $this->client)->call($storage);
    expect((string) $client->getEndpoint())->toBe('https://'.str_repeat('a', 32).'.eu.r2.cloudflarestorage.com')
        ->and($client->getRegion())->toBe('auto')
        ->and($client->getConfig('request_checksum_calculation')->mode ?? $client->getConfig('request_checksum_calculation'))->not->toBeNull();
});

it('uses the endpoint override with path style', function () {
    config(['portal.r2' => ['account_id' => str_repeat('a', 32), 'access_key_id' => 'k', 'secret_access_key' => 's',
        'concepts_bucket' => 'cbkt', 'final_deliverables_bucket' => 'fbkt', 'jurisdiction' => '', 'endpoint' => 'http://seaweedfs:8333']]);
    $client = (fn () => $this->client)->call(PrivateStorage::fromConfig());
    expect((string) $client->getEndpoint())->toBe('http://seaweedfs:8333')->and($client->getConfig('use_path_style_endpoint'))->toBeTrue();
});

it('validates configuration', function (array $override, string $message) {
    config(['portal.r2' => $override + ['account_id' => str_repeat('a', 32), 'access_key_id' => 'k', 'secret_access_key' => 's',
        'concepts_bucket' => 'cbkt', 'final_deliverables_bucket' => 'fbkt', 'jurisdiction' => '', 'endpoint' => null]]);
    PrivateStorage::fromConfig();
})->with([
    'missing key' => [['access_key_id' => ''], 'Missing private storage configuration: R2_ACCESS_KEY_ID'],
    'short account' => [['account_id' => 'abc'], 'Invalid R2 account ID'],
    'account with trailing newline' => [['account_id' => str_repeat('a', 32)."\n".'x'], 'Invalid R2 account ID'],
    'jurisdiction' => [['jurisdiction' => 'us'], 'Invalid R2 jurisdiction'],
    'same buckets' => [['final_deliverables_bucket' => 'cbkt'], 'Private storage namespaces require distinct buckets'],
    'bad bucket' => [['concepts_bucket' => 'A_B'], 'Invalid private bucket configuration'],
])->throws(InvalidConfiguration::class);

it('retries a server error twice (3 attempts) and then gives up', function () {
    $err = fn () => psS3Error('InternalError', 500);
    $mock = new MockHandler([$err, $err, $err, new Result([])]);
    $out = psMockStorage($mock)->remove([['bucket' => 'concepts', 'path' => 'a']]);
    expect($out['deleted'])->toBe(0)->and($mock->count())->toBe(1);
});

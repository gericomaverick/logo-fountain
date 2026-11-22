<?php

use App\Models\FileAsset;
use App\Support\Storage\PrivateStorage;
use App\Support\Storage\SignedImage;
use Aws\MockHandler;
use Aws\S3\S3Client;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Tests\Support\StorageTestClient as T;

// Story 3.4 (DV-12, ADR-021): the server half. No network, no DB.

function siStorage(): PrivateStorage
{
    return new PrivateStorage(new S3Client(T::options(new MockHandler([]))), 'concepts-bkt', 'finals-bkt');
}

function siAsset(string $path = 'p/c/v1.abc.png', string $bucket = 'concepts'): FileAsset
{
    return (new FileAsset)->forceFill(['bucket' => $bucket, 'path' => $path]);
}

it('has exactly the SignedImage shape', function () {
    $r = SignedImage::for(siAsset(), siStorage());
    expect(array_keys($r))->toBe(['imageKey', 'url', 'expiresAt'])
        ->and($r['imageKey'])->toMatch('/^[a-f0-9]{32}$/D')
        ->and($r['url'])->toBeString()
        ->and($r['expiresAt'])->toBeInt();
});

it('keeps the key across calls and time, changes it per path, and hides the path', function () {
    $a = SignedImage::for(siAsset(), siStorage());
    $this->travel(2)->seconds();
    $b = SignedImage::for(siAsset(), siStorage());
    $c = SignedImage::for(siAsset('p/c/v2.def.png'), siStorage());
    expect($b['imageKey'])->toBe($a['imageKey'])
        ->and($c['imageKey'])->not->toBe($a['imageKey'])
        ->and($a['imageKey'])->not->toContain('v1')
        ->and($a['imageKey'])->not->toContain('concepts');
});

it('sends expiresAt equal to the URL X-Amz-Date + X-Amz-Expires in ms', function () {
    $r = SignedImage::for(siAsset(), siStorage());
    parse_str((string) parse_url($r['url'], PHP_URL_QUERY), $q);
    $start = DateTimeImmutable::createFromFormat('Ymd\THis\Z', $q['X-Amz-Date'], new DateTimeZone('UTC'));
    expect($q['X-Amz-Expires'])->toBe('3600')
        ->and($r['expiresAt'])->toBe(($start->getTimestamp() + 3600) * 1000);
});

it('returns null for no asset', function () {
    expect(SignedImage::for(null, siStorage()))->toBeNull();
});

it('returns null and logs without the URL when signing fails', function () {
    Log::spy();
    expect(SignedImage::for(siAsset('p/c/x.png', 'nope'), siStorage()))->toBeNull();
    Log::shouldHaveReceived('warning')->once()->withArgs(fn ($m, $ctx) => ! str_contains(json_encode([$m, $ctx]), 'X-Amz'));
});

it('returns null when storage is unconfigured', function () {
    config(['portal.r2' => []]);
    expect(SignedImage::for(siAsset()))->toBeNull();
});

it('writes nothing to the database', function () {
    $queries = [];
    DB::listen(function ($q) use (&$queries) {
        $queries[] = $q->sql;
    });
    SignedImage::for(siAsset(), siStorage());
    expect($queries)->toBe([]);
});

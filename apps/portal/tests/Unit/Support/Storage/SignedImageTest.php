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

function siQuery(string $url): array
{
    parse_str((string) parse_url($url, PHP_URL_QUERY), $q);

    return $q;
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
    $this->travel(2)->hours(); // Carbon moves; the SDK clock does not, so only the key logic is under test
    $b = SignedImage::for(siAsset(), siStorage());
    $c = SignedImage::for(siAsset('p/c/v2.def.png'), siStorage());
    expect($b['imageKey'])->toBe($a['imageKey'])
        ->and($c['imageKey'])->not->toBe($a['imageKey'])
        ->and($a['imageKey'])->not->toBe(hash('sha256', 'concepts|p/c/v1.abc.png'))
        ->and($a['imageKey'])->toBe(substr(hash('sha256', 'concepts|p/c/v1.abc.png'), 0, 32));
});

it('expiresAt is not now() + ttl: it follows the URL signing time, not the Carbon clock', function () {
    $this->travel(5)->hours();
    $r = SignedImage::for(siAsset(), siStorage());
    expect($r['expiresAt'])->toBeLessThan(now()->addSeconds(3600)->getTimestamp() * 1000 - 3600 * 1000);
});

it('matches the committed fixture the vitest contract reads (captured from a real sign())', function () {
    $fx = json_decode(file_get_contents(base_path('tests/fixtures/signed-image.json')), true);
    $live = SignedImage::for(siAsset(), siStorage());
    $names = fn (string $u) => array_keys(siQuery($u));
    expect(array_keys($fx))->toBe(array_keys($live))
        ->and($fx['imageKey'])->toBe($live['imageKey'])
        ->and($names($fx['url']))->toBe($names($live['url']))
        ->and(parse_url($fx['url'], PHP_URL_PATH))->toBe(parse_url($live['url'], PHP_URL_PATH))
        ->and($fx['expiresAt'])->toBeInt();
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
    Log::shouldHaveReceived('warning')->once()->with('Image signing failed', ['exception' => InvalidArgumentException::class]);
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

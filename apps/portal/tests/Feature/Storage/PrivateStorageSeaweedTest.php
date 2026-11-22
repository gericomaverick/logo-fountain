<?php

use App\Support\Storage\ObjectKeyCollision;
use App\Support\Storage\PrivateStorage;
use Illuminate\Support\Facades\Http;
use Tests\Support\StorageTestClient as T;

// Story 3.1 (X-10, @storage L3, ledger #106 case 8): the real S3 protocol against the stack's SeaweedFS.

function seedFile(string $body): array
{
    $p = tempnam(sys_get_temp_dir(), 'sw');
    file_put_contents($p, $body);

    return ['path' => $p, 'extension' => 'txt', 'contentType' => 'text/plain', 'size' => strlen($body)];
}

it('stores once, collides on the second write, and the first bytes survive', function () {
    $s = T::seaweed();
    $key = 'test/'.bin2hex(random_bytes(8)).'/v1.txt';
    $s->upload('concepts', $key, seedFile('first'));
    expect(fn () => $s->upload('concepts', $key, seedFile('second')))->toThrow(ObjectKeyCollision::class);

    expect(Http::get($s->sign('concepts', $key, 60))->body())->toBe('first');
    expect($s->remove([['bucket' => 'concepts', 'path' => $key]]))->toBe(['attempted' => 1, 'deleted' => 1, 'failures' => []]);
});

it('serves a presigned final with the signed disposition echoed', function () {
    $s = T::seaweed();
    $key = 'test/'.bin2hex(random_bytes(8)).'/finals/a.zip';
    $s->upload('final-deliverables', $key, seedFile('zipbytes'));
    $res = Http::get($s->sign('final-deliverables', $key, 60, 'Acme-2026-03-05.zip'));
    expect($res->body())->toBe('zipbytes')->and($res->header('Content-Disposition'))->toContain('filename="Acme-2026-03-05.zip"');
    $s->remove([['bucket' => 'final-deliverables', 'path' => $key]]);
});

it('health: both buckets pass; a missing bucket fails alone', function () {
    expect(T::seaweed()->health())->toBe([['bucket' => 'concepts', 'passed' => true], ['bucket' => 'final-deliverables', 'passed' => true]]);
    expect(T::seaweed(T::CONCEPTS, 'portal-does-not-exist')->health())->toBe([['bucket' => 'concepts', 'passed' => true], ['bucket' => 'final-deliverables', 'passed' => false]]);
});

it('PrivateStorage is bound as a singleton built from config', function () {
    config(['portal.r2' => ['account_id' => str_repeat('a', 32), 'access_key_id' => 'k', 'secret_access_key' => 's',
        'concepts_bucket' => 'cbkt', 'final_deliverables_bucket' => 'fbkt', 'jurisdiction' => '', 'endpoint' => 'http://seaweedfs:8333']]);
    expect(app(PrivateStorage::class))->toBe(app(PrivateStorage::class));
});

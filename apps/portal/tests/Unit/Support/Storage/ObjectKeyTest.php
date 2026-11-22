<?php

use App\Support\Storage\PrivateStorage;

it('accepts valid keys', function (string $k) {
    expect(PrivateStorage::objectKey($k))->toBe($k);
})->with(['p/c/v1.abc.png', 'a', str_repeat('a', 1024), 'p/finals/x.zip', 'a..b/c']);

it('rejects invalid keys', function (string $k) {
    PrivateStorage::objectKey($k);
})->with(['', '/a', 'a//b', 'a/', './a', 'a/../b', '..', 'a\\b', "a\nb", "a\x7fb", "a\0b", str_repeat('a', 1025)])
    ->throws(InvalidArgumentException::class, 'Invalid private object key');

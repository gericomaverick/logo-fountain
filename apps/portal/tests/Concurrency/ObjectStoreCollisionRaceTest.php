<?php

// Story 3.1 (X-10, @pg-race, the 0.2 probe in PHP): 8 processes PUT one key; one wins, seven collide, the winner's bytes remain.

use Tests\Support\StorageTestClient;

it('8 concurrent creates of one key: exactly one wins, seven collide, stored bytes are the winner\'s', function () {
    $key = 'race/'.bin2hex(random_bytes(8)).'/v1.png';
    $files = [];
    $children = [];
    $start = microtime(true) + 3;
    for ($i = 0; $i < 8; $i++) {
        $files[$i] = tempnam(sys_get_temp_dir(), 'race');
        file_put_contents($files[$i], "body-{$i}");
        $p = proc_open([PHP_BINARY, base_path('tests/Support/storage-race-child.php'), (string) $start, $key, $files[$i]],
            [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, base_path());
        $children[] = [$p, $pipes];
    }
    $results = [];
    foreach ($children as $i => [$p, $pipes]) {
        $results[$i] = trim((string) stream_get_contents($pipes[1]).(string) stream_get_contents($pipes[2]));
        proc_close($p);
    }
    $winners = array_keys(array_filter($results, fn ($r) => $r === 'won'));
    expect(array_count_values($results))->toEqual(['won' => 1, 'collision' => 7])->and($winners)->toHaveCount(1);

    $s = StorageTestClient::seaweed();
    $body = file_get_contents($s->sign('concepts', $key, 60));
    expect($body)->toBe("body-{$winners[0]}");
    $s->remove([['bucket' => 'concepts', 'path' => $key]]);
});

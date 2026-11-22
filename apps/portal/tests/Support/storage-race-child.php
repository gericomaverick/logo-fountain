<?php

// Story 3.1 (@pg-race): one separate process that PUTs one key once, after a shared start time.
// Usage: php storage-race-child.php <start microtime> <key> <body file>. Prints "won" or "collision".

use App\Support\Storage\ObjectKeyCollision;
use Illuminate\Contracts\Console\Kernel;
use Tests\Support\StorageTestClient;

require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

[, $start, $key, $file] = $argv;
$storage = StorageTestClient::seaweed();
while (microtime(true) < (float) $start) {
    usleep(500);
}
try {
    $storage->upload('concepts', $key, ['path' => $file, 'extension' => 'png', 'contentType' => 'image/png', 'size' => (int) filesize($file)]);
    echo 'won';
} catch (ObjectKeyCollision) {
    echo 'collision';
}

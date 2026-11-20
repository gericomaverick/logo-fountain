<?php

// Story 1.6 (X-14, NFR-S3): every log channel scrubs secrets, tokens and signed URLs.

use App\Logging\ScrubLogs;
use App\Logging\ScrubSensitiveData;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Route;
use Monolog\Logger as Monolog;

beforeEach(function () {
    $this->logFile = storage_path('logs/scrub-test-'.uniqid().'.log');
    config(['logging.channels.scrubtest' => [
        'driver' => 'single',
        'path' => $this->logFile,
        'level' => 'debug',
        'replace_placeholders' => true,
        'tap' => [ScrubLogs::class],
    ]]);
});

afterEach(function () {
    @unlink($this->logFile);
});

it('taps every configured channel (except the tap-less emergency logger)', function () {
    /** @var array<string, array<string, mixed>> $channels */
    $channels = config('logging.channels');
    foreach ($channels as $name => $config) {
        if ($name === 'emergency' || $name === 'scrubtest') {
            continue;
        }
        expect($config['tap'] ?? [])->toContain(ScrubLogs::class);
    }
});

it('attaches the processor once, also through a stack', function () {
    config(['logging.channels.scrubstack' => ['driver' => 'stack', 'channels' => ['scrubtest'], 'tap' => [ScrubLogs::class]]]);

    /** @var Monolog $monolog */
    $monolog = Log::channel('scrubstack')->getLogger();
    $count = count(array_filter($monolog->getProcessors(), fn ($p) => $p instanceof ScrubSensitiveData));

    expect($count)->toBeGreaterThanOrEqual(1);
});

it('writes scrubbed messages, placeholders and context to the file', function () {
    $signed = 'https://abc.r2.cloudflarestorage.com/portal-finals/p/finals.zip?X-Amz-Signature=deadbeefcafe&X-Amz-Expires=300';
    $link = 'https://portal.test/auth/callback#token=Qm9vZ2llV29vZ2llMTIzNDU2Nzg5MA&next=%2Fdashboard';

    Log::channel('scrubtest')->warning('Sending {link} to {email}', [
        'link' => $link,
        'email' => 'client.a@parity.test',
        'password' => 'Parity-Next-2026!',
        'url' => $signed,
        'headers' => ['authorization' => 'Bearer sk_'.'live_51HxSecretValue'],
    ]);

    $written = (string) file_get_contents($this->logFile);
    foreach (['Qm9vZ2llV29vZ2ll', 'client.a@', 'Parity-Next-2026!', 'deadbeefcafe', '51HxSecretValue'] as $secret) {
        expect($written)->not->toContain($secret);
    }
    expect($written)->toContain('Sending https://portal.test/auth/callback#[REDACTED] to c***@parity.test')
        ->toContain('finals.zip?[REDACTED]');
});

it('scrubs reported exceptions (message and context)', function () {
    config(['logging.default' => 'scrubtest']);
    Route::get('/api/_test/boom', fn () => throw new RuntimeException('Upload to https://r2.test/k?X-Amz-Signature=abc123def failed for client.a@parity.test'));

    $this->get('/api/_test/boom')->assertStatus(500);

    $written = (string) file_get_contents($this->logFile);
    expect($written)->toContain('RuntimeException')
        ->toContain('https://r2.test/k?[REDACTED]')
        ->not->toContain('abc123def')
        ->not->toContain('client.a@');
});

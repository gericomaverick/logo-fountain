<?php

use App\Jobs\SendLifecycleMail;
use App\Support\LifecycleMail;
use App\Support\LifecycleMessage;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Symfony\Component\HttpClient\Response\MockResponse;
use Symfony\Component\Mailer\Exception\HttpTransportException;
use Symfony\Component\Mailer\SentMessage;
use Symfony\Component\Mailer\Transport\AbstractTransport;
use Tests\Support\MailFixtures;

// Story 2.7 AC 6-7 (X-18, NFR-R5): a failing transport is retried, then lands in failed_jobs with status text only.

const SENTINEL = 'SENTINEL-provider-body-secret';

final class ThrowingTransport extends AbstractTransport
{
    protected function doSend(SentMessage $message): void
    {
        $response = new MockResponse(SENTINEL, ['http_code' => 422]);
        $response->getStatusCode();
        throw new HttpTransportException('Unable to send an email: '.SENTINEL.' (code 422).', $response);
    }

    public function __toString(): string
    {
        return 'throwing://';
    }
}

beforeEach(function () {
    Mail::extend('throwing', fn () => new ThrowingTransport);
    config(['mail.mailers.failing' => ['transport' => 'throwing'], 'mail.default' => 'failing', 'queue.default' => 'database',
        'mail.from.address' => 'from@example.test', 'portal.public_site_url' => 'https://portal.example.test']);
});

afterEach(fn () => DB::disconnect());

it('declares four tries and the 10/60/300 backoff', function () {
    $job = new SendLifecycleMail(['a@example.test'], 's', 'h', 'i', 'c', 'https://x.test/', false, null, null);
    expect($job->tries)->toBe(4)->and($job->backoff())->toBe([10, 60, 300]);
});

it('throws and logs the status only, never the provider text', function () {
    Log::spy();
    $job = new SendLifecycleMail(['a@example.test'], 's', 'h', 'i', 'c', 'https://x.test/', false, null, null);
    try {
        $job->handle();
        $this->fail('expected a failure');
    } catch (RuntimeException $e) {
        expect($e->getMessage())->toBe('Postmark send failed (422)')->and($e->getPrevious())->toBeNull();
    }
    Log::shouldHaveReceived('error')->with('Postmark send failed (422)')->once();
});

it('retries then fails into failed_jobs with the action rows intact and no provider text', function () {
    $p = MailFixtures::project('b@example.test');
    expect(LifecycleMail::sendOnce('t', $p['project'], null, LifecycleMessage::client('S', 'I', 'Go', '/p'))->status)->toBe('sent');
    $owner = DB::connection('pgsql_migrate');
    for ($i = 0; $i < 4; $i++) {
        $owner->table('jobs')->update(['available_at' => 0]);
        Artisan::call('queue:work', ['--once' => true, '--stop-when-empty' => true]);
    }
    $failed = $owner->table('failed_jobs')->get();
    expect($failed)->toHaveCount(1)->and($owner->table('jobs')->count())->toBe(0);
    expect($failed[0]->exception)->toContain('Postmark send failed (422)')->not->toContain(SENTINEL);
    expect(MailFixtures::markers($p['project']))->toBe(1)
        ->and($owner->table('projects')->where('id', $p['project'])->exists())->toBeTrue();
});

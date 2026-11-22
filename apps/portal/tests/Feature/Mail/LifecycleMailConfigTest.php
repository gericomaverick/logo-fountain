<?php

use Illuminate\Mail\MailManager;
use Symfony\Component\Mailer\Bridge\Postmark\Transport\PostmarkApiTransport;

// Story 2.7 AC 8-9 (ADR-018): the Postmark transport resolves, stream `outbound`, token from config only.

it('resolves the postmark transport with the outbound stream and the configured token', function () {
    config(['services.postmark.token' => 'tok-123']);
    $mailer = app(MailManager::class)->mailer('postmark');
    $transport = $mailer->getSymfonyTransport();
    expect($transport)->toBeInstanceOf(PostmarkApiTransport::class);
    $ref = new ReflectionProperty($transport, 'messageStream');
    expect($ref->getValue($transport))->toBe('outbound');
    $key = new ReflectionProperty($transport, 'key');
    expect($key->getValue($transport))->toBe('tok-123');
    expect(config('mail.mailers.postmark.message_stream_id'))->toBe('outbound');
});

it('reads token and from address from config files only', function () {
    expect(config('services.postmark'))->toHaveKey('token');
    expect(config('mail.from.address'))->toBeString();
});

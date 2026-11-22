<?php

namespace Tests\Support;

use Closure;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Mail;
use Symfony\Component\Mailer\SentMessage;
use Symfony\Component\Mailer\Transport\AbstractTransport;
use Symfony\Component\Mime\Email;

/** Story 4.4: a mail transport that records every message and can run a callback (or throw) while "sending". */
final class ProbeTransport extends AbstractTransport
{
    /** @var list<Email> */
    public static array $sent = [];

    public static ?Closure $during = null;

    public static function install(?Closure $during = null): void
    {
        self::$sent = [];
        self::$during = $during;
        Mail::extend('probe', fn () => new self);
        Config::set('mail.mailers.probe', ['transport' => 'probe']);
        Config::set('mail.default', 'probe');
        Config::set('mail.from.address', 'hello@example.test');
        Mail::purge('probe');
    }

    protected function doSend(SentMessage $message): void
    {
        if (self::$during !== null) {
            (self::$during)();
        }
        self::$sent[] = $message->getOriginalMessage();
    }

    public function __toString(): string
    {
        return 'probe';
    }
}

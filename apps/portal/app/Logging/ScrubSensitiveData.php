<?php

namespace App\Logging;

use App\Support\Scrubber;
use Monolog\LogRecord;
use Monolog\Processor\ProcessorInterface;

/**
 * X-14 / NFR-S3: the Monolog processor that runs App\Support\Scrubber over every log record's
 * message, context and extra. Attached to every channel by ScrubLogs (`tap` in config/logging.php);
 * tests/Feature/LogScrubberTest.php fails if a channel lacks it.
 */
final class ScrubSensitiveData implements ProcessorInterface
{
    public function __invoke(LogRecord $record): LogRecord
    {
        /** @var array<mixed> $context */
        $context = Scrubber::scrub($record->context);
        /** @var array<mixed> $extra */
        $extra = Scrubber::scrub($record->extra);

        return $record->with(
            message: Scrubber::scrubString($record->message),
            context: $context,
            extra: $extra,
        );
    }
}

<?php

namespace App\Logging;

use Illuminate\Log\Logger;
use Monolog\Logger as Monolog;

/**
 * The `tap` for every channel in config/logging.php: adds ScrubSensitiveData once. Logger-level
 * processors run before handler-level ones (e.g. PsrLogMessageProcessor), so placeholders are
 * filled from the already-scrubbed context. A stack channel inherits its channels' processors.
 */
final class ScrubLogs
{
    public function __invoke(Logger $logger): void
    {
        $monolog = $logger->getLogger();
        if ($monolog instanceof Monolog && ! self::attached($monolog)) {
            $monolog->pushProcessor(new ScrubSensitiveData);
        }
    }

    public static function attached(Monolog $monolog): bool
    {
        foreach ($monolog->getProcessors() as $processor) {
            if ($processor instanceof ScrubSensitiveData) {
                return true;
            }
        }

        return false;
    }
}

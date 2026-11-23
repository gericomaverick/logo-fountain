<?php

namespace App\Support\Stripe;

use Throwable;

/**
 * `classifyWebhookError` (`webhook-error-classification.ts:21-82`): pure. Transient codes, then transient message
 * words, then permanent payload errors; anything else is transient (retry beats losing a paid order).
 * Laravel adds the PostgreSQL connection and timeout SQLSTATEs beside Prisma's P1001/P1002/P2024, and DV-15's
 * hopeless failures.
 */
final class WebhookClassifier
{
    private const TRANSIENT_CODES = [
        'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED',
        '08000', '08001', '08003', '08004', '08006', '57P01', '57P02', '57P03', '57014', '53300', '40001', '40P01',
    ];

    private const TRANSIENT_WORDS = ['timeout', 'rate limit', 'temporarily unavailable', 'network'];

    private const PERMANENT_WORDS = ['checkout session is not paid', 'malformed stripe event payload', 'allowlisted package', 'missing checkout session id'];

    public static function classify(Throwable $error): WebhookClassification
    {
        if ($error instanceof HopelessCheckoutFailure) {
            return new WebhookClassification(true, 'permanent_'.$error->reason);
        }

        $code = self::code($error);
        $message = strtolower($error->getMessage());

        if ($code !== null && in_array($code, self::TRANSIENT_CODES, true)) {
            return new WebhookClassification(false, "transient_code:{$code}");
        }
        foreach (self::TRANSIENT_WORDS as $word) {
            if (str_contains($message, $word)) {
                return new WebhookClassification(false, 'transient_message');
            }
        }
        if ($code === 'CHECKOUT_SESSION_NOT_PAID') {
            return new WebhookClassification(true, 'permanent_payload');
        }
        foreach (self::PERMANENT_WORDS as $word) {
            if (str_contains($message, $word)) {
                return new WebhookClassification(true, 'permanent_payload');
            }
        }

        return new WebhookClassification(false, 'default_transient');
    }

    private static function code(Throwable $error): ?string
    {
        if ($error instanceof CodedError) {
            return $error->errorCode();
        }
        $code = $error->getCode();

        return is_string($code) && $code !== '' ? $code : null;
    }
}

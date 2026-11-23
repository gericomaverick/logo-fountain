<?php

namespace App\Http\Controllers\Webhooks;

use App\Actions\Checkout\ProcessStripeEvent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Stripe\Webhook;
use Throwable;

/**
 * `POST /api/stripe/webhook` (K-05, `webhook/route.ts:26-45`). Stripe is not a browser: no session, no Origin
 * guard (the guard exempts this path, `tests/Arch/WebhookTest.php`). The signature authenticates the exact raw body.
 */
final class WebhookController
{
    public function __invoke(Request $request, ProcessStripeEvent $process): Response|JsonResponse
    {
        $secret = config('services.stripe.webhook_secret');
        if (! is_string($secret) || $secret === '') {
            return self::text('STRIPE_WEBHOOK_SECRET not set. For local dev run: stripe listen --forward-to localhost:3000/api/stripe/webhook');
        }
        $signature = $request->header('stripe-signature');
        if (! is_string($signature) || $signature === '') {
            return self::text('Missing stripe-signature header');
        }

        try {
            // The default tolerance (300 s) rejects an older signed replay.
            $event = Webhook::constructEvent($request->getContent(), $signature, $secret);
        } catch (Throwable $e) {
            return self::text('Webhook signature verification failed: '.$e->getMessage());
        }

        [$status, $body] = $process->handle($event);

        return response()->json($body, $status);
    }

    private static function text(string $message): Response
    {
        return response($message, 400, ['Content-Type' => 'text/plain;charset=UTF-8']);
    }
}

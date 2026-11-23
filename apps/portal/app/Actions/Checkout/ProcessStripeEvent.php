<?php

namespace App\Actions\Checkout;

use App\Support\Stripe\HopelessCheckoutFailure;
use App\Support\Stripe\WebhookClaimLost;
use App\Support\Stripe\WebhookClassification;
use App\Support\Stripe\WebhookClassifier;
use Illuminate\Support\Facades\Log;
use Stripe\Event;
use Stripe\Exception\InvalidRequestException;
use Stripe\StripeClient;
use Throwable;

/**
 * What the webhook does with a verified event (`webhook/route.ts:46-270`): ledger, claim, fulfilment through
 * `FulfilsCheckout`, lease fence, completion, classification. Returns [status, body].
 */
final class ProcessStripeEvent
{
    public function __construct(
        private readonly ClaimStripeEvent $claims,
        private readonly FulfilsCheckout $fulfiller,
        private readonly RecordHopelessCheckout $hopeless,
    ) {}

    /** @return array{0: int, 1: array<string, mixed>} */
    public function handle(Event $event): array
    {
        $id = (string) $event->id;
        $type = (string) $event->type;
        $created = (int) $event->created;
        $ident = ['id' => $id, 'type' => $type];

        $fulfils = $type === 'checkout.session.completed' || $type === 'checkout.session.async_payment_succeeded';
        if (! $fulfils) {
            $this->claims->settleIgnored($id, $type, $created);
            if ($type === 'checkout.session.async_payment_failed') {
                // Durable and observable without logging the provider payload.
                Log::warning('Stripe asynchronous checkout payment failed', $ident);

                return [200, ['received' => true, 'paymentFailed' => true] + $ident];
            }

            return [200, ['received' => true, 'ignored' => true] + $ident];
        }

        $claim = $this->claims->claim($id, $type, $created);
        if ($claim === ClaimOutcome::Deduped) {
            return [200, ['received' => true, 'deduped' => true] + $ident];
        }
        if ($claim === ClaimOutcome::InFlight) {
            return [409, ['received' => true, 'inFlight' => true, 'retry' => true] + $ident];
        }

        try {
            $payload = $event->data->object->toArray();
            $sessionId = $payload['id'] ?? null;
            if (! is_string($sessionId) || trim($sessionId) === '') {
                throw new \RuntimeException('Malformed Stripe event payload: missing checkout session id');
            }
            $session = $type === 'checkout.session.async_payment_succeeded' ? $this->retrieve($sessionId) : $payload;

            $result = $this->fulfiller->fulfil($session);
            $renew = fn () => $this->claims->renew($claim);
            $renew(); // fence an owner whose lease expired during durable fulfilment
            $result = $this->fulfiller->followUp($session, $result, $renew);
            $renew();
            if (! $this->claims->complete($claim)) {
                throw new WebhookClaimLost('Stripe webhook processing claim ownership was lost before completion');
            }

            return [200, [
                'received' => true,
                'fulfilled' => true,
                'deduped' => $result->deduped,
                'projectId' => $result->projectId,
                'id' => $id,
                'type' => $type,
                'purchaserEmail' => $result->purchaserEmail,
                'orderStatus' => $result->orderStatus,
                'provisionedUserId' => $result->provisionedUserId,
                'isReturningCustomer' => $result->isReturningCustomer,
            ]];
        } catch (Throwable $error) {
            return $this->fail($claim, $error, $ident);
        }
    }

    /**
     * @param  array{id: string, type: string}  $ident
     * @return array{0: int, 1: array<string, mixed>}
     */
    private function fail(Claim $claim, Throwable $error, array $ident): array
    {
        $c = WebhookClassifier::classify($error);
        $log = $ident + ['classification' => $c->kind(), 'reason' => $c->reason, 'retry' => $c->shouldRetry()];

        if ($c->permanent) {
            Log::warning('Stripe checkout webhook failed permanently', $log);
            try {
                if ($error instanceof HopelessCheckoutFailure) {
                    $this->hopeless->handle($claim, $error);
                } else {
                    $this->claims->complete($claim);
                }
            } catch (Throwable $settle) {
                // Could not settle (database trouble): free the claim so the retry can.
                Log::error('Stripe checkout webhook could not settle a permanent failure', $ident + ['error' => $settle::class]);
                $this->claims->release($claim);

                return [500, $this->failureBody(WebhookClassifier::classify($settle))];
            }
        } else {
            Log::error('Stripe checkout webhook failed transiently', $log);
            // Only this delivery's claim; if the delete fails the marker still expires after LEASE_MS.
            $this->claims->release($claim);
        }

        return [$c->status(), $this->failureBody($c)];
    }

    /** @return array<string, mixed> */
    private function failureBody(WebhookClassification $c): array
    {
        return ['received' => true, 'fulfilled' => false, 'error' => 'Webhook processing failed', 'classification' => $c->kind(), 'retry' => $c->shouldRetry()];
    }

    /** @return array<string, mixed> */
    private function retrieve(string $sessionId): array
    {
        try {
            return app(StripeClient::class)->checkout->sessions->retrieve($sessionId)->toArray();
        } catch (InvalidRequestException $e) {
            if ($e->getHttpStatus() === 404) {
                throw HopelessCheckoutFailure::unknownSession($sessionId);
            }
            throw $e;
        }
    }
}

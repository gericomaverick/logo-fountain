<?php

namespace App\Actions\Checkout;

use App\Models\Client;
use App\Models\Project;
use App\Models\ProjectEntitlement;
use App\Models\ProjectOrder;
use App\Support\Audit;
use App\Support\DatabaseRoles;
use App\Support\Db;
use App\Support\Stripe\FulfilmentError;
use App\Support\Stripe\HopelessCheckoutFailure;
use App\Support\Stripe\StripeCatalog;
use Closure;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB as Database;
use Stripe\Exception\InvalidRequestException;
use Stripe\StripeClient;

/**
 * K-06 / K-07 (story 5.3; Next `fulfillCheckoutSession`, `checkout-fulfillment.ts:325-436`): a paid Checkout Session
 * becomes a client, a project, its entitlements, an order and two audit events, in one transaction, idempotent on the
 * session id. `followUp` then provisions access and sends each email once. DV-4: the campaign slug is kept on the order.
 */
final class FulfilCheckout implements FulfilsCheckout
{
    public function __construct(
        private readonly StripeClient $stripe,
        private readonly StripeCatalog $catalog,
        private readonly ProvisionAccess $provision,
        private readonly CompleteFulfilmentSideEffects $sideEffects,
    ) {}

    public function fulfil(array $session): FulfilmentResult
    {
        $sessionId = is_string($session['id'] ?? null) ? $session['id'] : '';
        $paymentStatus = $session['payment_status'] ?? null;
        if ($paymentStatus === 'no_payment_required') {
            throw HopelessCheckoutFailure::noPaymentRequired($sessionId); // DV-25: never silent
        }
        if ($paymentStatus !== 'paid') {
            $shown = is_string($paymentStatus) ? $paymentStatus : 'missing';
            throw new FulfilmentError("Checkout session is not paid (payment_status: {$shown})", 'CHECKOUT_SESSION_NOT_PAID');
        }

        $email = CheckoutSessionData::purchaserEmail($session, $this->stripe);
        if ($this->isUpsell($session)) {
            // Story 5.5 owns additive fulfilment; until then Stripe retries rather than losing a paid event.
            throw new FulfilmentError('Upsell fulfilment is not available yet', 'UPSELL_NOT_AVAILABLE');
        }

        $existing = $this->existing($sessionId, $email);
        if ($existing !== null) {
            return $existing;
        }

        $package = $this->packageCode($sessionId);
        $name = CheckoutSessionData::clientName($session);
        $slug = (CheckoutSessionData::slug($name) ?: 'logo-fountain-client').'-'.strtolower(substr($sessionId, -8));
        $intent = is_string($session['payment_intent'] ?? null) ? $session['payment_intent'] : null;
        $currency = strtolower(is_string($session['currency'] ?? null) && $session['currency'] !== '' ? $session['currency'] : 'gbp');
        $metadata = is_array($session['metadata'] ?? null) ? $session['metadata'] : [];
        $campaign = is_string($metadata['campaign_slug'] ?? null) && $metadata['campaign_slug'] !== '' ? $metadata['campaign_slug'] : null;
        $status = $email !== null ? 'FULFILLED' : 'NEEDS_CONTACT';

        try {
            return Database::connection(DatabaseRoles::RUNTIME)->transaction(function () use ($sessionId, $email, $package, $name, $slug, $intent, $currency, $campaign, $status, $session): FulfilmentResult {
                $client = Client::create(['name' => $name, 'slug' => $slug, 'billing_email' => $email]);
                $project = Project::create(['client_id' => $client->id, 'status' => 'AWAITING_BRIEF', 'package_code' => $package]);
                foreach (PackageEntitlements::for($package) as $e) {
                    ProjectEntitlement::create(['project_id' => $project->id, 'key' => $e['key'], 'limit_int' => $e['limit'], 'consumed_int' => 0, 'reserved_int' => 0]);
                }
                $order = ProjectOrder::create([
                    'project_id' => $project->id, 'client_id' => $client->id, 'status' => $status, 'currency' => $currency,
                    'total_cents' => is_int($session['amount_total'] ?? null) ? $session['amount_total'] : 0,
                    'stripe_checkout_session_id' => $sessionId, 'stripe_payment_intent_id' => $intent, 'campaign_slug' => $campaign,
                ]);
                Audit::record('order_fulfilled', $project, null, ['orderId' => $order->id, 'orderStatus' => $status, 'checkoutSessionId' => $sessionId]);
                Audit::record('state_changed', $project, null, ['previousStatus' => null, 'nextStatus' => 'AWAITING_BRIEF']);

                return new FulfilmentResult($client->id, $project->id, $email, false, $status);
            });
        } catch (QueryException $e) {
            if (Db::sqlState($e) !== '23505') {
                throw $e;
            }
            // A concurrent first delivery committed the same session (its client slug or order collided): converge.
            $won = $this->existing($sessionId, $email);
            if ($won !== null) {
                return $won;
            }
            if (str_contains($e->getMessage(), 'stripe_payment_intent_id')) {
                throw HopelessCheckoutFailure::paymentIntentReused($sessionId); // DV-15: another session owns the intent
            }
            throw $e;
        }
    }

    public function followUp(array $session, FulfilmentResult $result, Closure $renew): FulfilmentResult
    {
        $sessionId = is_string($session['id'] ?? null) ? $session['id'] : '';
        $userId = null;
        $returning = false;
        $needsSetup = false;
        if ($result->purchaserEmail !== null) {
            $names = CheckoutSessionData::names($session);
            $access = $this->provision->handle($result->clientId, $result->purchaserEmail, $names['first'], $names['last']);
            [$userId, $returning, $needsSetup] = [$access->userId, $access->existed, $access->needsSetup];
        }
        $renew();
        $this->sideEffects->handle($sessionId, $result->projectId, $userId, $needsSetup, ! $this->isUpsell($session), $renew);

        return $result->withProvisioning($userId, $returning);
    }

    /** @param array<string, mixed> $session */
    private function isUpsell(array $session): bool
    {
        $metadata = $session['metadata'] ?? null;

        return is_array($metadata) && isset($metadata['kind']) && $metadata['kind'] !== '';
    }

    private function existing(string $sessionId, ?string $email): ?FulfilmentResult
    {
        $order = ProjectOrder::query()->where('stripe_checkout_session_id', $sessionId)->first();

        return $order === null ? null : new FulfilmentResult($order->client_id, $order->project_id, $email, true, $order->status);
    }

    /** Exactly one allowlisted price among the first ten line items (`:128-145`). */
    private function packageCode(string $sessionId): string
    {
        try {
            $items = $this->stripe->checkout->sessions->allLineItems($sessionId, ['limit' => 10])->toArray()['data'] ?? [];
        } catch (InvalidRequestException $e) {
            if ($e->getHttpStatus() === 404) {
                throw HopelessCheckoutFailure::unknownSession($sessionId);
            }
            throw $e;
        }
        $codes = [];
        foreach ($items as $item) {
            $price = is_array($item) && is_array($item['price'] ?? null) ? ($item['price']['id'] ?? null) : null;
            $code = is_string($price) && $price !== '' ? $this->catalog->packageForPriceId($price) : null;
            if ($code !== null) {
                $codes[$code] = true;
            }
        }
        if (count($codes) !== 1) {
            throw new FulfilmentError('Checkout session did not resolve to exactly one allowlisted package', 'NO_PACKAGE');
        }

        return (string) array_key_first($codes);
    }
}

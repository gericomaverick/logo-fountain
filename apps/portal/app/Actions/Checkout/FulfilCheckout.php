<?php

namespace App\Actions\Checkout;

use App\Models\Client;
use App\Models\Project;
use App\Models\ProjectEntitlement;
use App\Models\ProjectOrder;
use App\Support\Audit;
use App\Support\DatabaseRoles;
use App\Support\Db;
use App\Support\LifecycleMail;
use App\Support\LifecycleMessage;
use App\Support\Locks;
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
        private readonly FulfilUpsell $upsell,
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
        $upsell = UpsellMetadata::parse($session);
        if ($upsell !== null) {
            return $this->upsell->handle($session, $upsell, $email); // story 5.5 (K-09); unparseable metadata falls through (AC 11)
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
        if ($result->purchaserEmail !== null && $this->isUpsell($session) && $this->emailMismatch($session, $result)) {
            return $result->withProvisioning(null, false); // DV-15 (5.5 AC 12): no account for a stranger's email
        }
        if ($result->purchaserEmail !== null) {
            $names = CheckoutSessionData::names($session);
            $access = $this->provision->handle($result->clientId, $result->purchaserEmail, $names['first'], $names['last']);
            [$userId, $returning, $needsSetup] = [$access->userId, $access->existed, $access->needsSetup];
        }
        $renew();
        $this->sideEffects->handle($sessionId, $result->projectId, $userId, $needsSetup, ! $this->isUpsell($session), $renew);

        return $result->withProvisioning($userId, $returning);
    }

    /**
     * DV-15 (story 5.5 AC 12): the buyer's email is not the client's billing email. The entitlements are already
     * applied; audit it and alert the admin once, under the session lock (the reprocess race, critic B4).
     *
     * @param  array<string, mixed>  $session
     */
    private function emailMismatch(array $session, FulfilmentResult $result): bool
    {
        $billing = Client::query()->whereKey($result->clientId)->value('billing_email');
        if (CheckoutSessionData::email($billing) === $result->purchaserEmail) {
            return false;
        }
        $sessionId = is_string($session['id'] ?? null) ? $session['id'] : '';
        Database::connection(DatabaseRoles::RUNTIME)->transaction(function () use ($sessionId, $result): void {
            Locks::fulfilSideEffects($sessionId);
            $marker = LifecycleMail::markerType('upsell_buyer_email_mismatch', $sessionId);
            if (Database::connection(DatabaseRoles::RUNTIME)->table('audit_events')->where('project_id', $result->projectId)->where('type', $marker)->exists()) {
                return;
            }
            Audit::record('upsell_buyer_email_mismatch', $result->projectId, null, ['checkoutSessionId' => $sessionId, 'purchaserEmail' => $result->purchaserEmail]);
            LifecycleMail::sendOnce('upsell_buyer_email_mismatch', $result->projectId, $sessionId, LifecycleMessage::admin(
                RecordHopelessCheckout::SUBJECT,
                "Checkout session {$sessionId} was an upsell paid by an email that is not the client's billing email. The upgrade was applied; no account was created for it.",
                'Open admin',
                '/admin',
            ));
        });

        return true;
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

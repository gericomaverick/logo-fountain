<?php

namespace App\Actions\Checkout;

use App\Models\Project;
use App\Models\ProjectEntitlement;
use App\Models\ProjectOrder;
use App\Support\Audit;
use App\Support\Checkout\EntitlementMath;
use App\Support\DatabaseRoles;
use App\Support\Db;
use App\Support\Stripe\HopelessCheckoutFailure;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB as Database;

/**
 * K-09 (story 5.5; `checkout-fulfillment.ts:182-323`): a paid upsell session adds to the project's entitlements, once.
 * DV-2: an upgrade adds the tier difference to the current limit (the add-on is kept). DV-24: an upgrade whose
 * `fromPackage` is no longer the project's package applies nothing (critic B3). The project row is locked for the
 * read-modify-write, and the order is re-checked under that lock, so two deliveries change the limits once.
 */
final class FulfilUpsell
{
    private const KEYS = ['concepts', 'revisions'];

    /** @param array<string, mixed> $session */
    public function handle(array $session, UpsellMetadata $meta, ?string $purchaserEmail): FulfilmentResult
    {
        $sessionId = is_string($session['id'] ?? null) ? $session['id'] : '';
        $intent = is_string($session['payment_intent'] ?? null) ? $session['payment_intent'] : null;

        $existing = $this->existing($sessionId, $intent, $purchaserEmail);
        if ($existing !== null) {
            return $existing;
        }

        $currency = strtolower(is_string($session['currency'] ?? null) && $session['currency'] !== '' ? $session['currency'] : 'gbp');
        $total = is_int($session['amount_total'] ?? null) ? $session['amount_total'] : 0;

        try {
            return Database::connection(DatabaseRoles::RUNTIME)->transaction(function () use ($sessionId, $intent, $meta, $purchaserEmail, $currency, $total): FulfilmentResult {
                $project = Project::query()->lockForUpdate()->find($meta->projectId);
                if ($project === null) {
                    throw HopelessCheckoutFailure::upsellProjectMissing($sessionId);
                }
                $won = $this->existing($sessionId, $intent, $purchaserEmail);
                if ($won !== null) {
                    return $won;
                }

                if ($meta->kind === 'addon') {
                    $this->addon($project, $sessionId, $intent);
                } else {
                    $this->upgrade($project, $meta, $sessionId, $intent);
                }

                $order = ProjectOrder::create([
                    'project_id' => $project->id, 'client_id' => $project->client_id, 'status' => 'FULFILLED', 'currency' => $currency,
                    'total_cents' => $total, 'stripe_checkout_session_id' => $sessionId, 'stripe_payment_intent_id' => $intent,
                    'campaign_slug' => $meta->campaignSlug(),
                ]);
                Audit::record('order_fulfilled', $project, null, ['orderId' => $order->id, 'orderStatus' => 'FULFILLED', 'checkoutSessionId' => $sessionId, 'kind' => $meta->kind]);

                return new FulfilmentResult($project->client_id, $project->id, $purchaserEmail, false, 'FULFILLED');
            });
        } catch (QueryException $e) {
            if (Db::sqlState($e) !== '23505') {
                throw $e;
            }

            return $this->existing($sessionId, $intent, $purchaserEmail) ?? throw $e;
        }
    }

    private function addon(Project $project, string $sessionId, ?string $intent): void
    {
        $revisions = ProjectEntitlement::query()->where('project_id', $project->id)->where('key', 'revisions')->lockForUpdate()->first();
        if ($revisions === null) {
            ProjectEntitlement::create(['project_id' => $project->id, 'key' => 'revisions', 'limit_int' => 1, 'consumed_int' => 0, 'reserved_int' => 0]);
        } else {
            $revisions->limit_int = EntitlementMath::addon($revisions->limit_int);
            $revisions->save();
        }
        Audit::record('entitlement_addon_applied', $project, null, ['checkoutSessionId' => $sessionId, 'paymentIntentId' => $intent, 'addonKey' => 'extra_revision', 'revisionDelta' => 1]);
    }

    private function upgrade(Project $project, UpsellMetadata $meta, string $sessionId, ?string $intent): void
    {
        $from = (string) $meta->fromPackage;
        $to = (string) $meta->toPackage;
        $fromLimit = (int) PackageEntitlements::tierLimit($from);
        $toLimit = (int) PackageEntitlements::tierLimit($to);
        // DV-24: the project must still be on the package the customer upgraded from, and the step must go up.
        if ($project->package_code !== $from || ! EntitlementMath::isUpgrade($fromLimit, $toLimit)) {
            throw HopelessCheckoutFailure::upgradeStaleFromPackage($sessionId, $project->id, $project->package_code, $from, $to);
        }

        foreach (self::KEYS as $key) {
            $row = ProjectEntitlement::query()->where('project_id', $project->id)->where('key', $key)->lockForUpdate()->first();
            if ($row === null) {
                ProjectEntitlement::create(['project_id' => $project->id, 'key' => $key, 'limit_int' => $toLimit, 'consumed_int' => 0, 'reserved_int' => 0]);
            } else {
                $row->limit_int = EntitlementMath::upgrade($row->limit_int, $fromLimit, $toLimit);
                $row->save();
            }
        }
        $project->package_code = $to; // not a lifecycle change: `version` is untouched (Next `project.update({packageCode})`)
        $project->save();
        Audit::record('package_upgrade_applied', $project, null, ['checkoutSessionId' => $sessionId, 'paymentIntentId' => $intent, 'fromPackage' => $from, 'toPackage' => $to]);
    }

    /** An order for this session or this payment intent already exists (`:191-207`). */
    private function existing(string $sessionId, ?string $intent, ?string $email): ?FulfilmentResult
    {
        $order = ProjectOrder::query()->where(function ($q) use ($sessionId, $intent) {
            $q->where('stripe_checkout_session_id', $sessionId);
            if ($intent !== null) {
                $q->orWhere('stripe_payment_intent_id', $intent);
            }
        })->first();

        return $order === null ? null : new FulfilmentResult($order->client_id, $order->project_id, $email, true, $order->status);
    }
}

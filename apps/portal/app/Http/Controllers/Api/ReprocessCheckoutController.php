<?php

namespace App\Http\Controllers\Api;

use App\Actions\Checkout\FulfilsCheckout;
use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Models\ProjectOrder;
use App\Support\Audit;
use App\Support\ErrorCodes;
use App\Support\Stripe\FulfilmentError;
use App\Support\Stripe\HopelessCheckoutFailure;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Stripe\Exception\ApiErrorException;
use Stripe\StripeClient;

/**
 * K-12: `POST /api/admin/checkout/reprocess` (`reprocess/route.ts`). The webhook's own fulfilment and follow-up
 * (ADR-015, DV-6): the customer and admin emails go out once, under the session lock in the shared side-effects
 * action. No ledger row is claimed (Open question 1): the order's unique session id is the idempotency key.
 */
final class ReprocessCheckoutController extends Controller
{
    public function __invoke(Request $request, FulfilsCheckout $fulfiller): JsonResponse
    {
        $body = json_decode($request->getContent(), true);
        $raw = is_array($body) ? ($body['session_id'] ?? null) : null;
        $sessionId = is_string($raw) ? trim($raw) : '';
        if ($sessionId === '') {
            throw new ApiException('Missing session_id', 400, ErrorCodes::MISSING_SESSION_ID); // DV-23
        }

        try {
            $session = app(StripeClient::class)->checkout->sessions->retrieve($sessionId)->toArray();
        } catch (ApiErrorException $e) {
            if ($e->getHttpStatus() === 404) {
                throw new ApiException('Checkout session not found', 404, ErrorCodes::CHECKOUT_SESSION_NOT_FOUND); // DV-23
            }

            throw new ApiException('Stripe is unavailable', 502, ErrorCodes::STRIPE_UNAVAILABLE);
        }

        try {
            $result = $fulfiller->fulfil($session);
            $result = $fulfiller->followUp($session, $result, static fn () => null);
        } catch (FulfilmentError $e) {
            $this->audit($request, $sessionId, null, 'failed', $e->errorCode());
            if ($e->errorCode() === 'CHECKOUT_SESSION_NOT_PAID') {
                throw new ApiException('Checkout session has not been paid; nothing was provisioned.', 409, ErrorCodes::CHECKOUT_SESSION_NOT_PAID);
            }
            throw $e;
        } catch (HopelessCheckoutFailure $e) {
            $this->audit($request, $sessionId, $e->projectId, 'failed', $e->reason);
            throw $e;
        }

        $this->audit($request, $sessionId, $result->projectId, $result->deduped ? 'already_fulfilled' : 'fulfilled');
        $orderId = ProjectOrder::query()->where('stripe_checkout_session_id', $sessionId)->value('id');

        return response()->json([
            'ok' => true, 'deduped' => $result->deduped, 'projectId' => $result->projectId, 'orderId' => $orderId,
            'clientId' => $result->clientId, 'purchaserEmail' => $result->purchaserEmail, 'orderStatus' => $result->orderStatus,
            'provisionedUserId' => $result->provisionedUserId,
            'message' => $result->deduped ? 'Session already fulfilled; ensured access provisioning.' : 'Session fulfilled successfully.',
        ]);
    }

    /**
     * DV-26 (proposed, awaiting owner; Next writes none): the reprocess itself leaves a row, even when everything was
     * already done, so an admin's action is never invisible. `actor_id` is the admin; the payload names the checkout
     * session, the admin's web session and the outcome.
     */
    private function audit(Request $request, string $sessionId, ?string $projectId, string $outcome, ?string $reason = null): void
    {
        $admin = $request->user();
        Audit::record('checkout_reprocessed', $projectId, $admin instanceof Model ? $admin : null, array_filter([
            'checkoutSessionId' => $sessionId,
            'outcome' => $outcome,
            'reason' => $reason,
        ], static fn ($v) => $v !== null));
    }
}

<?php

namespace App\Http\Controllers\Api;

use App\Actions\Checkout\FulfilsCheckout;
use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Models\ProjectOrder;
use App\Support\ErrorCodes;
use App\Support\Stripe\FulfilmentError;
use App\Support\Stripe\HopelessCheckoutFailure;
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
            if ($e->errorCode() === 'CHECKOUT_SESSION_NOT_PAID') {
                throw new ApiException('Checkout session has not been paid; nothing was provisioned.', 409, ErrorCodes::CHECKOUT_SESSION_NOT_PAID);
            }
            throw $e;
        } catch (HopelessCheckoutFailure $e) {
            if ($e->reason === HopelessCheckoutFailure::NO_PAYMENT_REQUIRED) {
                throw new ApiException('Checkout session has not been paid; nothing was provisioned.', 409, ErrorCodes::CHECKOUT_SESSION_NOT_PAID);
            }
            throw $e;
        }

        $orderId = ProjectOrder::query()->where('stripe_checkout_session_id', $sessionId)->value('id');

        return response()->json([
            'ok' => true, 'deduped' => $result->deduped, 'projectId' => $result->projectId, 'orderId' => $orderId,
            'clientId' => $result->clientId, 'purchaserEmail' => $result->purchaserEmail, 'orderStatus' => $result->orderStatus,
            'provisionedUserId' => $result->provisionedUserId,
            'message' => $result->deduped ? 'Session already fulfilled; ensured access provisioning.' : 'Session fulfilled successfully.',
        ]);
    }
}

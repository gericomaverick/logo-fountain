<?php

namespace App\Http\Controllers\Api;

use App\Actions\Auth\SendAuthLink;
use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Jobs\SendAuthLinkMail;
use App\Models\ProjectOrder;
use App\Support\ErrorCodes;
use App\Support\RateLimits;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Throwable;

/**
 * K-03/K-04: `POST /api/checkout/magic-link` and `/resend-magic-link`, one action (Next `checkout-auth-email.ts`).
 * The link is emailed to the recorded purchaser, never returned, and is always a sign-in link: a leaked session
 * id can never set a password. Nothing the provider says is logged or returned.
 */
final class CheckoutAuthEmailController extends Controller
{
    public function __invoke(Request $request, SendAuthLink $send): JsonResponse
    {
        $body = json_decode($request->getContent(), true);
        if (! is_array($body)) {
            throw new ApiException('Invalid JSON body', 400, ErrorCodes::INVALID_JSON);
        }
        $raw = $body['session_id'] ?? null;
        $sessionId = is_string($raw) ? trim($raw) : '';
        if ($sessionId === '') {
            throw new ApiException('Missing session_id', 400, ErrorCodes::MISSING_SESSION_ID);
        }

        $order = ProjectOrder::query()->where('stripe_checkout_session_id', $sessionId)->with('client')->first();
        if ($order === null || $order->status !== 'FULFILLED') {
            throw new ApiException('Checkout session is not fulfilled yet.', 409, ErrorCodes::NOT_FULFILLED);
        }

        $email = strtolower(trim((string) $order->client?->billing_email));
        if ($email === '') {
            throw new ApiException('No purchaser email found.', 409, ErrorCodes::MISSING_EMAIL);
        }

        $limit = RateLimits::consumeCheckoutEmail($sessionId, $email);
        if (! $limit->allowed) {
            return response()->json(
                ['error' => ['code' => ErrorCodes::RATE_LIMITED, 'message' => 'Please wait before requesting another sign-in email.']],
                429,
                ['Retry-After' => (string) ($limit->retryAfterSeconds ?? 60)],
            );
        }

        if (! SendAuthLink::configured()) {
            throw new ApiException('Sign-in email is temporarily unavailable.', 503, ErrorCodes::EMAIL_UNAVAILABLE);
        }

        // Q2 (DV-27): the same work and the same answer whether or not the purchaser has an account: one queue
        // insert; the account is looked up when the job runs. The proof and the email happen in the job. Always `magic`: the session id never sets a password.
        try {
            SendAuthLinkMail::dispatch(null, 'magic', '/project/'.$order->project_id, $sessionId); // K-03: the link lands on the order's project, as Next does
        } catch (Throwable) {
            throw new ApiException('Unable to send sign-in email.', 500, ErrorCodes::AUTH_EMAIL_SEND_FAILED);
        }

        return response()->json(['ok' => true, 'delivery' => 'email']);
    }
}

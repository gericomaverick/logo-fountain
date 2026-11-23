<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Models\ProjectOrder;
use App\Support\ErrorCodes;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * K-02: `GET /api/checkout/status?session_id=…` (Next `status/route.ts`). The only unauthenticated read of order
 * state: exactly two fields, and an unknown session is byte-identical to a pending one. `no-store` is additive.
 */
final class CheckoutStatusController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $raw = $request->query('session_id');
        $sessionId = is_string($raw) ? trim($raw) : '';
        if ($sessionId === '') {
            throw new ApiException('Missing session_id', 400, ErrorCodes::MISSING_SESSION_ID, ['nextStep' => 'Include session_id query param.']);
        }

        $fulfilled = ProjectOrder::query()->where('stripe_checkout_session_id', $sessionId)->value('status') === 'FULFILLED';

        return response()->json(['fulfilled' => $fulfilled, 'status' => $fulfilled ? 'FULFILLED' : 'PENDING'])
            ->header('Cache-Control', 'no-store');
    }
}

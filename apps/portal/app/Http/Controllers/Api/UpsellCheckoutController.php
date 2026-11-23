<?php

namespace App\Http\Controllers\Api;

use App\Actions\Checkout\StartUpsellCheckout;
use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Middleware\EnforceSessionCap;
use App\Models\Project;
use App\Models\User;
use App\Policies\ProjectPolicy;
use App\Support\ErrorCodes;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * K-08: `POST /api/projects/{id}/checkout/session` (Next `projects/[id]/checkout/session/route.ts`). Signed in, and a
 * member of the project (`participate`: an admin who is not a member gets 404 too); then the body, then the kind.
 */
final class UpsellCheckoutController extends Controller
{
    public function __invoke(Request $request, string $id, StartUpsellCheckout $start): JsonResponse
    {
        $user = $request->attributes->get(EnforceSessionCap::USER);
        if (! $user instanceof User) {
            throw new ApiException('Unauthorized', 401, ErrorCodes::UNAUTHORIZED, ['nextStep' => 'Sign in and retry.']);
        }
        $project = preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $id) === 1 ? Project::query()->find($id) : null;
        if ($project === null || ! (new ProjectPolicy)->participate($user, $project)->allowed()) {
            throw new ApiException('Project not found', 404, ErrorCodes::PROJECT_NOT_FOUND, ['nextStep' => 'Check the project link.']);
        }
        $body = json_decode($request->getContent(), true);
        if (! is_array($body)) {
            throw new ApiException('Invalid JSON body', 400, ErrorCodes::INVALID_JSON, ['nextStep' => 'Send a valid JSON payload.']);
        }

        /** @var array<string, mixed> $body */
        return response()->json(['url' => $start($request, $project, $body)]);
    }
}

<?php

namespace App\Http\Controllers\Api;

use App\Actions\Approval\ApproveConcept;
use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Middleware\EnforceSessionCap;
use App\Models\Project;
use App\Models\User;
use App\Policies\ProjectPolicy;
use App\Support\ErrorCodes;
use App\Support\NodeCompat;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Story 6.9 (C-12, DV-7): `POST /api/projects/{id}/approve`. Member only (an admin gets 404 PROJECT_NOT_FOUND).
 * Check order as Next: sign-in, body, membership, concept, status transition. The acknowledgement is the UI's
 * confirmation step; Next's route takes only `conceptId`, and so does this one.
 */
final class ApproveConceptController extends Controller
{
    private const UUID = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i';

    public function __invoke(Request $request, string $id, ApproveConcept $approve): JsonResponse
    {
        $user = $request->attributes->get(EnforceSessionCap::USER);
        if (! $user instanceof User) {
            throw new ApiException('Unauthorized', 401, ErrorCodes::UNAUTHORIZED, ['nextStep' => 'Sign in and retry.']);
        }
        $payload = json_decode($request->getContent(), false);
        $conceptId = is_object($payload) && isset($payload->conceptId) && is_string($payload->conceptId) ? NodeCompat::trimEnv($payload->conceptId) : '';
        if ($conceptId === '') {
            throw new ApiException('conceptId is required', 400, ErrorCodes::INVALID_CONCEPT_ID, ['nextStep' => 'Provide a valid conceptId in the request body.']);
        }
        $project = preg_match(self::UUID, $id) === 1 ? Project::query()->find($id) : null;
        if ($project === null || (new ProjectPolicy)->participate($user, $project)->denied()) {
            throw new ApiException('Project not found', 404, ErrorCodes::PROJECT_NOT_FOUND, ['nextStep' => 'Check the project link.']);
        }

        return response()->json(['ok' => true, ...$approve($project, $user->id, $conceptId)]);
    }
}

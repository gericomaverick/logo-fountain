<?php

namespace App\Http\Controllers\Api;

use App\Actions\Revisions\RequestRevision;
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
 * Story 6.8 (C-11, DV-7): `POST /api/projects/{id}/revision-requests`. Member only (an admin gets 404 PROJECT_NOT_FOUND).
 * Check order as Next: sign-in, body, membership, status transition, concept, entitlement.
 */
final class RevisionRequestController extends Controller
{
    private const UUID = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i';

    public function store(Request $request, string $id, RequestRevision $revise): JsonResponse
    {
        $user = $request->attributes->get(EnforceSessionCap::USER);
        if (! $user instanceof User) {
            throw new ApiException('Unauthorized', 401, ErrorCodes::UNAUTHORIZED, ['nextStep' => 'Sign in and retry.']);
        }
        $payload = json_decode($request->getContent(), false);
        $body = is_object($payload) && isset($payload->body) && is_string($payload->body) ? NodeCompat::trimEnv($payload->body) : '';
        $conceptId = is_object($payload) && isset($payload->conceptId) && is_string($payload->conceptId) ? NodeCompat::trimEnv($payload->conceptId) : '';
        if ($body === '' || $conceptId === '' || strlen(mb_convert_encoding($body, 'UTF-16LE', 'UTF-8')) / 2 > RequestRevision::MAX_LENGTH) {
            throw new ApiException('Body (1-5000 chars) and conceptId are required', 400, ErrorCodes::INVALID_BODY, ['nextStep' => 'Submit feedback from a specific concept, including conceptId.']);
        }
        $project = preg_match(self::UUID, $id) === 1 ? Project::query()->find($id) : null;
        if ($project === null || (new ProjectPolicy)->participate($user, $project)->denied()) {
            throw new ApiException('Project not found', 404, ErrorCodes::PROJECT_NOT_FOUND, ['nextStep' => 'Check the project link.']);
        }

        return response()->json(['ok' => true, ...$revise($project, $user->id, $conceptId, $body)], 201);
    }
}

<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Middleware\EnforceSessionCap;
use App\Models\Project;
use App\Models\User;
use App\Policies\ConceptPolicy;
use App\Policies\ProjectPolicy;
use App\Queries\ClientConcepts;
use App\Queries\ConceptThread;
use App\Support\ErrorCodes;
use App\Support\NodeCompat;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Story 6.8 (C-10, DV-7, DV-14): `GET/POST /api/projects/{id}/concepts/{conceptId}/comments`. Admin or member.
 * The concept thread only: no system message, no email (the project thread is the messages routes, story 6.10).
 */
final class ConceptCommentController extends Controller
{
    private const UUID = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i';

    public function index(Request $request, string $id, string $conceptId): JsonResponse
    {
        [, $ids] = $this->resolve($request, $id, $conceptId);

        return response()->json(['comments' => ConceptThread::list(...$ids)]);
    }

    public function store(Request $request, string $id, string $conceptId): JsonResponse
    {
        [$user, $ids] = $this->resolve($request, $id, $conceptId);
        $payload = json_decode($request->getContent(), false);
        $raw = is_object($payload) && isset($payload->body) && is_string($payload->body) ? NodeCompat::trimEnv($payload->body) : '';
        if ($raw === '' || strlen(mb_convert_encoding($raw, 'UTF-16LE', 'UTF-8')) / 2 > ConceptThread::MAX_LENGTH) {
            throw new ApiException('Comment body is required (1-2000 chars)', 400, ErrorCodes::INVALID_COMMENT_BODY, ['nextStep' => 'Provide a non-empty comment.']);
        }

        return response()->json(['ok' => true, 'comment' => ConceptThread::add(...$ids, authorId: $user->id, body: $raw)], 201);
    }

    /** @return array{0: User, 1: array{string, string}} */
    private function resolve(Request $request, string $id, string $conceptId): array
    {
        $user = $request->attributes->get(EnforceSessionCap::USER);
        if (! $user instanceof User) {
            throw new ApiException('Unauthorized', 401, ErrorCodes::UNAUTHORIZED, ['nextStep' => 'Sign in and retry.']);
        }
        $project = preg_match(self::UUID, $id) === 1 ? Project::query()->find($id) : null;
        if ($project === null && $user->isAdmin()) {
            throw $this->conceptNotFound();
        }
        if ($project === null || (new ProjectPolicy)->view($user, $project)->denied()) {
            throw new ApiException('Project not found', 404, ErrorCodes::PROJECT_NOT_FOUND, ['nextStep' => 'Check the project link.']);
        }
        $concept = preg_match(self::UUID, $conceptId) === 1 ? ClientConcepts::find($project, $conceptId) : null;
        if ($concept === null || (new ConceptPolicy)->view($user, $concept)->denied()) {
            throw $this->conceptNotFound();
        }

        return [$user, [$concept->project_id, $concept->id]];
    }

    private function conceptNotFound(): ApiException
    {
        return new ApiException('Concept not found', 404, ErrorCodes::CONCEPT_NOT_FOUND, ['nextStep' => 'Check the concept link.']);
    }
}

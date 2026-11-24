<?php

namespace App\Http\Controllers\Api;

use App\Actions\Messages\ProjectMessages;
use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Middleware\EnforceSessionCap;
use App\Models\Project;
use App\Models\User;
use App\Policies\ProjectPolicy;
use App\Support\ErrorCodes;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** C-14 (messages) and C-15 (read state): admin or member; a non-member gets 404 `PROJECT_NOT_FOUND` (IDOR-safe). */
final class MessageController extends Controller
{
    private const UUID = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i';

    public function index(Request $request, string $id): JsonResponse
    {
        $project = $this->project($id, $this->user($request));

        return response()->json(['messages' => ProjectMessages::list($project)]);
    }

    public function store(Request $request, string $id): JsonResponse
    {
        $user = $this->user($request);
        $project = $this->project($id, $user);
        $payload = json_decode($request->getContent(), false);
        $body = is_object($payload) && isset($payload->body) && is_string($payload->body) ? trim($payload->body) : '';
        if ($body === '' || mb_strlen($body) > 2000) {
            throw new ApiException('Message body is required (1-2000 chars)', 400, ErrorCodes::INVALID_MESSAGE_BODY, ['nextStep' => 'Provide a non-empty message.']);
        }

        return response()->json(['ok' => true, 'message' => ProjectMessages::send($project, $user, $body)], 201);
    }

    public function readState(Request $request, string $id): JsonResponse
    {
        $user = $this->user($request);
        $project = $this->project($id, $user);
        $payload = json_decode($request->getContent(), false);
        $area = is_object($payload) && isset($payload->area) ? $payload->area : null;
        if ($area !== 'messages' && $area !== 'concepts') {
            throw new ApiException("area is required ('messages' | 'concepts')", 400, ErrorCodes::INVALID_AREA, ['nextStep' => 'Send area=messages or area=concepts.']);
        }
        ProjectMessages::markSeen($project, $user, $area);

        return response()->json(['ok' => true]);
    }

    private function project(string $id, User $user): Project
    {
        $project = preg_match(self::UUID, $id) === 1 ? Project::query()->find($id) : null;
        if ($project === null || (new ProjectPolicy)->view($user, $project)->denied()) {
            throw new ApiException('Project not found', 404, ErrorCodes::PROJECT_NOT_FOUND, ['nextStep' => 'Check the project link.']);
        }

        return $project;
    }

    private function user(Request $request): User
    {
        $user = $request->attributes->get(EnforceSessionCap::USER);
        if (! $user instanceof User) {
            throw new ApiException('Unauthorized', 401, ErrorCodes::UNAUTHORIZED, ['nextStep' => 'Sign in and retry.']);
        }

        return $user;
    }
}

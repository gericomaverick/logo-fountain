<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Middleware\EnforceSessionCap;
use App\Models\Project;
use App\Models\User;
use App\Policies\ProjectPolicy;
use App\Queries\ProjectSnapshot;
use App\Support\ErrorCodes;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * C-02 (snapshot) and C-16 (entitlements): `api/projects/[id]/route.ts`, `api/projects/[id]/entitlements/route.ts`.
 * The snapshot is readable by an admin or a member; entitlements by a member only (an admin who is not a member gets 404).
 */
final class ProjectSnapshotController extends Controller
{
    public function show(Request $request, string $id): JsonResponse
    {
        $user = $this->user($request);
        $project = $this->find($id);
        if ($project === null || ! (new ProjectPolicy)->view($user, $project)->allowed()) {
            throw $this->notFound();
        }

        return response()->json(['snapshot' => ProjectSnapshot::for($project, $user->id)]);
    }

    public function entitlements(Request $request, string $id): JsonResponse
    {
        $user = $this->user($request);
        $project = $this->find($id);
        if ($project === null || ! (new ProjectPolicy)->participate($user, $project)->allowed()) {
            throw $this->notFound();
        }
        $usage = ProjectSnapshot::entitlementRows($project->id);

        return response()->json(['entitlements' => ['concepts' => $usage['concepts'], 'revisions' => $usage['revisions']]]);
    }

    private function find(string $id): ?Project
    {
        return preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $id) === 1 ? Project::query()->find($id) : null;
    }

    private function notFound(): ApiException
    {
        return new ApiException('Project not found', 404, ErrorCodes::PROJECT_NOT_FOUND, ['nextStep' => 'Check the project link.']);
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

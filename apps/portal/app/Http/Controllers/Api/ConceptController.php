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
use App\Support\ErrorCodes;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * C-08 (concepts list) and C-09 (concept assets): `api/projects/[id]/concepts/route.ts`, `.../[conceptId]/assets/route.ts`.
 * Admin or member. Concepts are reached only through `Project::clientVisibleConcepts()` (ADR-020), so a draft,
 * deleted or archived concept id answers exactly like an unknown one: 404 CONCEPT_NOT_FOUND (DV-7).
 */
final class ConceptController extends Controller
{
    private const UUID = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i';

    public function index(Request $request, string $id): JsonResponse
    {
        $user = $this->user($request);
        $project = $this->find($id);
        if ($project === null && $user->isAdmin()) {
            return response()->json(['concepts' => [], 'projectStatus' => null]);
        }
        $project = $this->authorised($user, $project);

        $items = ClientConcepts::list($project);

        return response()->json(['concepts' => $items, 'projectStatus' => $project->status]);
    }

    public function assets(Request $request, string $id, string $conceptId): JsonResponse
    {
        $user = $this->user($request);
        $project = $this->find($id);
        if ($project === null && $user->isAdmin()) {
            throw $this->conceptNotFound();
        }
        $project = $this->authorised($user, $project);

        $concept = preg_match(self::UUID, $conceptId) === 1 ? ClientConcepts::find($project, $conceptId) : null;
        if ($concept === null || (new ConceptPolicy)->view($user, $concept)->denied()) {
            throw $this->conceptNotFound();
        }
        $assets = ClientConcepts::assets($concept);

        return response()->json(['assets' => $assets]);
    }

    private function authorised(User $user, ?Project $project): Project
    {
        if ($project === null || (new ProjectPolicy)->view($user, $project)->denied()) {
            throw new ApiException('Project not found', 404, ErrorCodes::PROJECT_NOT_FOUND, ['nextStep' => 'Check the project link.']);
        }

        return $project;
    }

    private function find(string $id): ?Project
    {
        return preg_match(self::UUID, $id) === 1 ? Project::query()->find($id) : null;
    }

    private function conceptNotFound(): ApiException
    {
        return new ApiException('Concept not found', 404, ErrorCodes::CONCEPT_NOT_FOUND, ['nextStep' => 'Check the concept link.']);
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

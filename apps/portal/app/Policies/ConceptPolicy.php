<?php

namespace App\Policies;

use App\Models\Concept;
use App\Models\User;
use App\Support\ErrorCodes;
use Illuminate\Auth\Access\Response;

/**
 * A concept on a client path (ADR-020, DV-7): the project check first (as Next: PROJECT_NOT_FOUND before any
 * concept lookup), then client visibility, for admins too (`projects/[id]/concepts/route.ts:37`). A hidden
 * concept is denied exactly as an unknown one is: 404 CONCEPT_NOT_FOUND. Each client route still owns its
 * own not-found body (e.g. 400 for revision requests, `01-feature-inventory.md:178`).
 */
class ConceptPolicy
{
    public function view(User $user, Concept $concept): Response
    {
        $project = (new ProjectPolicy)->view($user, $concept->project);
        if ($project->denied()) {
            return $project;
        }

        return $concept->isVisibleToClient() ? Response::allow() : self::notFound();
    }

    /** Next: `RouteAuthError("Concept not found", 404, "CONCEPT_NOT_FOUND", ...)` (`concepts/[conceptId]/comments/route.ts:36`). */
    public static function notFound(): Response
    {
        return Response::denyAsNotFound('Concept not found', ErrorCodes::CONCEPT_NOT_FOUND);
    }
}

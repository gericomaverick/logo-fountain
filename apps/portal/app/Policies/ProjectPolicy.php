<?php

namespace App\Policies;

use App\Models\Project;
use App\Models\User;
use App\Support\ErrorCodes;
use Illuminate\Auth\Access\Response;

/**
 * The three project-access patterns Next uses (story 2.2 AC 2). No Gate::before admin bypass: some client
 * routes deny admins who aren't members.
 *
 * - participate: membership only (requireProjectMembership, `lib/auth/require.ts:49-61`); admins get no
 *   exemption. Client mutations and private client data (revision requests, approve, invoices, checkout,
 *   entitlements, brief draft, brief POST).
 * - view: admin, else member (the authorizeProjectAccess pattern, e.g. `projects/[id]/concepts/route.ts:10-21`).
 *   An admin passes without a membership or existence query.
 * - administer: admin only (requireAdmin, `require.ts:41-47`).
 *
 * A membership miss is a 404 PROJECT_NOT_FOUND, never a 403, so a project's existence never leaks.
 */
class ProjectPolicy
{
    public function participate(User $user, Project $project): Response
    {
        return $project->hasMember($user) ? Response::allow() : self::notFound();
    }

    public function view(User $user, Project $project): Response
    {
        return $user->isAdmin() ? Response::allow() : $this->participate($user, $project);
    }

    public function administer(User $user): Response
    {
        return $user->isAdmin() ? Response::allow() : Response::deny('Forbidden', ErrorCodes::FORBIDDEN)->withStatus(403);
    }

    /** Next: `RouteAuthError("Project not found", 404, "PROJECT_NOT_FOUND", { nextStep: "Check the project link." })`. */
    public static function notFound(): Response
    {
        return Response::denyAsNotFound('Project not found', ErrorCodes::PROJECT_NOT_FOUND);
    }
}

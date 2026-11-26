<?php

namespace App\Http\Controllers\Pages;

use App\Http\Controllers\Controller;
use App\Http\Middleware\EnforceSessionCap;
use App\Models\Project;
use App\Models\User;
use App\Policies\ProjectPolicy;
use App\Queries\ProjectSnapshot;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Story 6.2b (C-03): the customer Overview at /project/{id}. The first paint carries the snapshot (the same
 * shape as GET /api/projects/{id}); the page then polls that endpoint. A project the visitor cannot see is a 404.
 */
final class ProjectOverviewController extends Controller
{
    public function show(Request $request, string $id): Response|RedirectResponse
    {
        $user = $request->attributes->get(EnforceSessionCap::USER);
        if ($user instanceof User && $user->isAdmin()) {
            return redirect('/admin/projects/'.$id); // DV-UX (D-02): admins work in the admin workspace; the page itself is Epic 7
        }
        $valid = preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $id) === 1;
        $project = $valid ? Project::query()->find($id) : null;
        abort_unless($user instanceof User && $project !== null && (new ProjectPolicy)->view($user, $project)->allowed(), 404);

        return Inertia::render('Project/Overview', [
            'projectId' => $project->id,
            'snapshot' => ProjectSnapshot::for($project, $user->id),
            'user' => ['name' => $user->name, 'email' => $user->email],
        ]);
    }
}

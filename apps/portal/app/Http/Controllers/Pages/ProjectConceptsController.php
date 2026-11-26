<?php

namespace App\Http\Controllers\Pages;

use App\Http\Controllers\Controller;
use App\Http\Middleware\EnforceSessionCap;
use App\Models\Project;
use App\Models\User;
use App\Policies\ProjectPolicy;
use App\Queries\ClientConcepts;
use App\Queries\ProjectSnapshot;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Story 6.7 UI half (C-08, C-09; UX §14): the concepts gallery /project/{id}/concepts and the concept viewer
 * /project/{id}/concept/{cid}. Pages render the shell and ids; images come from the signed-URL APIs, never from
 * storage paths. A concept a client may not see (draft, deleted, other project) is the same 404 as an unknown one (DV-7).
 */
final class ProjectConceptsController extends Controller
{
    public function gallery(Request $request, string $id): Response|RedirectResponse
    {
        $resolved = $this->resolve($request, $id);
        if ($resolved instanceof RedirectResponse) {
            return $resolved;
        }
        [$user, $project] = $resolved;

        return Inertia::render('Project/Concepts', $this->props($user, $project));
    }

    public function show(Request $request, string $id, string $conceptId): Response|RedirectResponse
    {
        $resolved = $this->resolve($request, $id);
        if ($resolved instanceof RedirectResponse) {
            return $resolved;
        }
        [$user, $project] = $resolved;
        $valid = preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $conceptId) === 1;
        $concept = $valid ? ClientConcepts::find($project, $conceptId) : null;
        abort_if($concept === null, 404);

        return Inertia::render('Project/Concept', $this->props($user, $project) + [
            'concept' => ['id' => $concept->id, 'number' => $concept->number, 'status' => $concept->status, 'notes' => $concept->notes],
        ]);
    }

    /**
     * @return array{0: User, 1: Project}|RedirectResponse
     */
    private function resolve(Request $request, string $id): array|RedirectResponse
    {
        $user = $request->attributes->get(EnforceSessionCap::USER);
        if ($user instanceof User && $user->isAdmin()) {
            return redirect('/admin/projects/'.$id);
        }
        $valid = preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $id) === 1;
        $project = $valid ? Project::query()->find($id) : null;
        abort_unless($user instanceof User && $project !== null && (new ProjectPolicy)->view($user, $project)->allowed(), 404);

        return [$user, $project];
    }

    /**
     * @return array<string, mixed>
     */
    private function props(User $user, Project $project): array
    {
        return [
            'projectId' => $project->id,
            'snapshot' => ProjectSnapshot::for($project, $user->id),
            'user' => ['name' => $user->name, 'email' => $user->email],
        ];
    }
}

<?php

namespace App\Http\Controllers\Pages;

use App\Http\Controllers\Controller;
use App\Http\Middleware\EnforceSessionCap;
use App\Models\Project;
use App\Models\User;
use App\Queries\ProjectListRows;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Story 6.1 (C-01, UX §5.3, DV-UX): /dashboard. A customer with exactly one project goes straight to its Overview; otherwise the list, newest first, each row with
 * its status (the UI derives the turn pill) and the "new" dots from the snapshot read state.
 */
final class DashboardController extends Controller
{
    public function __invoke(Request $request): Response|RedirectResponse
    {
        $user = $request->attributes->get(EnforceSessionCap::USER);
        abort_unless($user instanceof User, 404);
        // An admin stays on the list (membership-based, so usually empty) until Epic 7 builds /admin: redirecting there
        // now would strand admin sign-in on a 404. Next's /dashboard → /admin lands with that epic.
        $projects = Project::query()
            ->whereIn('client_id', fn ($q) => $q->select('client_id')->from('client_memberships')->where('user_id', $user->id))
            ->orderByDesc('created_at')->orderBy('id')->get();
        $only = $projects->first();
        if ($projects->count() === 1 && $only !== null) {
            return redirect('/project/'.$only->id);
        }

        return Inertia::render('Dashboard', [
            'projects' => ProjectListRows::for($projects, $user->id),
            'user' => ['name' => $user->name, 'email' => $user->email],
        ]);
    }
}

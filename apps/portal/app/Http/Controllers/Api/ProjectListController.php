<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Middleware\EnforceSessionCap;
use App\Models\Project;
use App\Models\User;
use App\Support\ErrorCodes;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * C-02 (list): `GET /api/projects` (`apps/web/src/app/api/projects/route.ts`). The projects of every client the
 * signed-in user is a member of, as `{projects:[{id,status,packageCode}]}`, newest first. Membership only: an
 * admin without memberships gets an empty list. Turn pills and new-dots are derived by the UI (from `status`
 * and the polled snapshot); the Next contract carries no such fields, so none are added here.
 */
final class ProjectListController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $user = $request->attributes->get(EnforceSessionCap::USER);
        if (! $user instanceof User) {
            throw new ApiException('Unauthorized', 401, ErrorCodes::UNAUTHORIZED, ['nextStep' => 'Sign in and retry.']);
        }

        $projects = Project::query()
            ->whereIn('client_id', fn ($q) => $q->select('client_id')->from('client_memberships')->where('user_id', $user->id))
            ->orderByDesc('created_at')->orderBy('id')
            ->get(['id', 'status', 'package_code'])
            ->map(fn (Project $p) => ['id' => $p->id, 'status' => $p->status, 'packageCode' => $p->package_code])
            ->values();

        return response()->json(['projects' => $projects]);
    }
}

<?php

namespace App\Http\Controllers\Api;

use App\Actions\Finals\DownloadFinal;
use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Middleware\EnforceSessionCap;
use App\Models\User;
use App\Support\ErrorCodes;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Story 6.11 (C-13): `POST /api/projects/{id}/finals`. Member only, and every miss (non-member, admin, unknown or
 * non-uuid project, no approval, no final ZIP, wrong status) is the same 404 FINAL_ZIP_NOT_AVAILABLE, never PROJECT_NOT_FOUND.
 */
final class FinalDownloadController extends Controller
{
    public function download(Request $request, string $id, DownloadFinal $download): JsonResponse
    {
        $user = $request->attributes->get(EnforceSessionCap::USER);
        if (! $user instanceof User) {
            throw new ApiException('Unauthorized', 401, ErrorCodes::UNAUTHORIZED, ['nextStep' => 'Sign in and retry.']);
        }
        $result = preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $id) === 1 ? $download($id, $user->id) : null;
        if ($result === null) {
            throw new ApiException('Final ZIP not available', 404, ErrorCodes::FINAL_ZIP_NOT_AVAILABLE, ['nextStep' => 'Final files require approval and a completed delivery state.']);
        }

        return response()->json($result);
    }
}

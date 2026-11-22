<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Middleware\AuthJsonBoundary;
use App\Http\Middleware\EnforceSessionCap;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** A-03 (story 4.1): `GET /api/auth/session`, Next `app/api/auth/session/route.ts`. */
final class SessionController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $user = $request->attributes->get(EnforceSessionCap::USER);
        if (! $user instanceof User) {
            return AuthJsonBoundary::json(['authenticated' => false]);
        }

        return AuthJsonBoundary::json([
            'authenticated' => true,
            'userId' => $user->id,
            'email' => $user->email,
            'isAdmin' => $user->isAdmin(),
        ]);
    }
}

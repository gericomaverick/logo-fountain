<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Middleware\EnforceSessionCap;
use App\Models\Profile;
use App\Models\User;
use App\Support\ErrorCodes;
use App\Support\NodeCompat;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Story 6.12 (C-17, DV-3): `GET/PUT /api/profile`, first and last name only (no VAT field; unknown keys are ignored).
 * Compared with `apps/web/src/app/api/profile/route.ts`: a name is JS-trimmed (`NodeCompat::trimEnv`), empty maps to
 * null, and is cut to 80 UTF-16 code units (`NodeCompat::slice`, a cut, not a rejection). Omitted keys keep their value.
 * Theme persistence has no server side in Next (localStorage `lf-theme`, story 1.7), so none is added here.
 */
final class ProfileController extends Controller
{
    private const MAX_NAME = 80;

    public function show(Request $request): JsonResponse
    {
        $user = $this->user($request);

        return response()->json(['profile' => $this->shape($user, $user->profile)]);
    }

    public function update(Request $request): JsonResponse
    {
        $user = $this->user($request);
        $payload = json_decode($request->getContent(), false);
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new ApiException('Invalid JSON body', 400, ErrorCodes::INVALID_JSON, ['nextStep' => 'Send a valid JSON payload.']);
        }
        $body = is_object($payload) ? $payload : new \stdClass;
        $first = $this->parse($body, 'firstName');
        $last = $this->parse($body, 'lastName');
        if ($first === false) {
            throw new ApiException('Invalid firstName', 400, ErrorCodes::INVALID_FIRST_NAME, ['nextStep' => 'firstName must be a string or null.']);
        }
        if ($last === false) {
            throw new ApiException('Invalid lastName', 400, ErrorCodes::INVALID_LAST_NAME, ['nextStep' => 'lastName must be a string or null.']);
        }

        $existing = $user->profile;
        $firstName = $first === true ? $existing?->first_name : $first;
        $lastName = $last === true ? $existing?->last_name : $last;
        $fullName = trim(implode(' ', array_filter([$firstName, $lastName], fn ($n) => $n !== null && $n !== '')));
        $values = ['first_name' => $firstName, 'last_name' => $lastName, 'full_name' => $fullName !== '' ? $fullName : null];

        $profile = $existing ?? new Profile(['email' => $user->email]);
        if ($existing === null) {
            $profile->id = $user->id;
        }
        $profile->fill($values)->save();

        return response()->json(['profile' => $this->shape($user, $profile)]);
    }

    /** `parseOptionalName`: true = key absent (keep), false = not a string or null (400), else the new value. */
    private function parse(object $body, string $key): string|bool|null
    {
        if (! property_exists($body, $key)) {
            return true;
        }
        $value = $body->{$key};
        if ($value === null) {
            return null;
        }
        if (! is_string($value)) {
            return false;
        }
        $trimmed = NodeCompat::trimEnv($value);

        return $trimmed === '' ? null : NodeCompat::slice($trimmed, self::MAX_NAME);
    }

    /** @return array<string, mixed> */
    private function shape(User $user, ?Profile $profile): array
    {
        return [
            'id' => $user->id,
            'email' => $profile !== null ? $profile->email : $user->email,
            'firstName' => $profile?->first_name,
            'lastName' => $profile?->last_name,
            'fullName' => $profile?->full_name,
        ];
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

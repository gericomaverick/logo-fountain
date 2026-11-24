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
        $payload = json_decode(self::replaceLoneSurrogates($request->getContent()), false);
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

    /**
     * `JSON.parse` accepts a lone `\uD800` escape (and the pg driver later writes it as U+FFFD); `json_decode` rejects it
     * (JSON_ERROR_UTF16). Replace each unpaired surrogate escape with `\uFFFD`; `\\` pairs are consumed first so an escaped backslash is safe.
     */
    private static function replaceLoneSurrogates(string $raw): string
    {
        return preg_replace_callback(
            '/\\\\\\\\|\\\\u(d[89ab][0-9a-f]{2})\\\\u(d[c-f][0-9a-f]{2})|\\\\u(d[89a-f][0-9a-f]{2})/i',
            fn (array $m) => isset($m[3]) ? '\\ufffd' : $m[0],
            $raw
        ) ?? $raw;
    }

    /** `slice(0, 80)`; a cut inside an astral pair leaves a lone surrogate that the pg driver writes as U+FFFD (Next), not `?`. */
    private static function cut(string $value): string
    {
        $cut = NodeCompat::slice($value, self::MAX_NAME);
        if ($cut === $value || ! str_ends_with($cut, '?') || mb_strlen($value) < mb_strlen($cut)) {
            return $cut;
        }
        $head = mb_substr($cut, 0, -1);

        return mb_substr($value, mb_strlen($head), 1) === '?' ? $cut : $head."\u{FFFD}";
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

        return $trimmed === '' ? null : self::cut($trimmed);
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

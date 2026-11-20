<?php

namespace App\Support;

use Illuminate\Http\JsonResponse;
use stdClass;

/**
 * The X-03 error envelope, ported from apps/web/src/lib/api-error.ts (`jsonError`):
 * `{error:{message, code?, details?}}`. Controllers never build error JSON by hand.
 */
final class ApiError
{
    /** Next's Response.json escapes neither slashes nor unicode. */
    public const JSON_FLAGS = JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE;

    /**
     * @param  array<string, mixed>|null  $details
     * @return array{error: array<string, mixed>}
     */
    public static function body(string $message, ?string $code = null, ?array $details = null): array
    {
        $error = ['message' => $message];
        if ($code !== null && $code !== '') {
            $error['code'] = $code;
        }
        if ($details !== null) {
            // An empty details map must stay a JSON object, as in Next.
            $error['details'] = $details === [] ? new stdClass : $details;
        }

        return ['error' => $error];
    }

    /** @param  array<string, mixed>|null  $details */
    public static function response(string $message, int $status, ?array $details = null, ?string $code = null): JsonResponse
    {
        return new JsonResponse(self::body($message, $code, $details), $status, [], self::JSON_FLAGS);
    }
}

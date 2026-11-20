<?php

namespace App\Http\Middleware;

use App\Exceptions\AuthFailure;
use App\Http\RawCacheControlHeaderBag;
use App\Support\ApiError;
use App\Support\ErrorCodes;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * A-17: the auth JSON wrapper, ported from apps/web/src/lib/auth/http.ts (`authJson`, `authMutation`).
 *
 * `auth.json`        (the six body-reading auth mutations): Content-Type must be application/json
 *                    (400 INVALID_JSON), body capped at 8192 bytes while reading (413
 *                    PAYLOAD_TOO_LARGE), it must be a JSON object, and any throw except AuthFailure
 *                    becomes the generic 400 AUTH_FAILED. The parsed body: AuthJsonBoundary::body().
 * `auth.json:headers` (GET session, POST logout): only the authJson headers.
 *
 * Every response gets `Cache-Control: no-store`. Next's authJson also sets `Referrer-Policy:
 * no-referrer`, but next.config's global header overrides it, so the wire value is the site
 * policy; SecurityHeaders (outermost) does the same here.
 * Order on a route (as authMutation): proxy check (1.3/1.5) → origin guard (1.4) → this.
 */
final class AuthJsonBoundary
{
    public const MAX_BYTES = 8192;

    public const GENERIC_MESSAGE = 'Authentication could not be completed. Check your details or request a new link.';

    private const BODY = 'authJsonBody';

    public function handle(Request $request, Closure $next, string $mode = 'body'): Response
    {
        if ($mode === 'headers') {
            return self::noStore($next($request));
        }

        if (preg_match('/^application\/json(?:\s*;|$)/i', (string) $request->headers->get('Content-Type', '')) !== 1) {
            return self::json(['error' => ['code' => ErrorCodes::INVALID_JSON]], 400);
        }

        $raw = self::readCapped($request);
        if ($raw === null) {
            return self::json(['error' => ['code' => ErrorCodes::PAYLOAD_TOO_LARGE]], 413);
        }

        $body = self::decodeObject($raw);
        if ($body === null) {
            return self::failure(400, ErrorCodes::AUTH_FAILED);
        }
        $request->attributes->set(self::BODY, $body);

        /** @var Response $response */
        $response = $next($request);

        // The routing pipeline has already rendered (and reported) any exception. Never expose
        // native diagnostics: only an AuthFailure keeps its own status and code.
        $exception = $response instanceof JsonResponse || $response instanceof \Illuminate\Http\Response
            ? $response->exception
            : null;
        if ($exception !== null && ! $exception instanceof AuthFailure) {
            return self::failure(400, ErrorCodes::AUTH_FAILED);
        }

        return self::noStore($response);
    }

    /**
     * The parsed JSON object of an `auth.json` request.
     *
     * @return array<string, mixed>
     */
    public static function body(Request $request): array
    {
        $body = $request->attributes->get(self::BODY);

        return is_array($body) ? $body : [];
    }

    /** authJson(body, status): a JSON response with exactly `Cache-Control: no-store`. */
    public static function json(mixed $body, int $status = 200): JsonResponse
    {
        $response = new JsonResponse($body, $status, [], ApiError::JSON_FLAGS);
        self::noStore($response);

        return $response;
    }

    /** The generic auth failure body (`{error:{code, message}}`). */
    public static function failure(int $status, string $code): JsonResponse
    {
        return self::json(['error' => ['code' => $code, 'message' => self::GENERIC_MESSAGE]], $status);
    }

    private static function noStore(Response $response): Response
    {
        RawCacheControlHeaderBag::noStore($response);

        return $response;
    }

    /**
     * Reads at most MAX_BYTES + 1 bytes, so an oversized body is never held in full by the app.
     * A declared Content-Length over the cap is refused before reading. Null = over the cap.
     */
    private static function readCapped(Request $request): ?string
    {
        $declared = $request->headers->get('Content-Length');
        if ($declared !== null && ctype_digit($declared) && (int) $declared > self::MAX_BYTES) {
            return null;
        }

        $stream = $request->getContent(true);
        $raw = stream_get_contents($stream, self::MAX_BYTES + 1);
        if ($raw === false) {
            $raw = '';
        }

        return strlen($raw) > self::MAX_BYTES ? null : $raw;
    }

    /**
     * JSON.parse after TextDecoder: a UTF-8 BOM is dropped, invalid bytes become U+FFFD.
     * Only a JSON object is accepted (not null, an array, a string or a number).
     *
     * @return array<string, mixed>|null
     */
    private static function decodeObject(string $raw): ?array
    {
        if (str_starts_with($raw, "\xEF\xBB\xBF")) {
            $raw = substr($raw, 3);
        }
        // 8192 bytes can nest at most 4096 levels; JSON.parse has no depth limit.
        $flags = JSON_INVALID_UTF8_SUBSTITUTE;
        $decoded = json_decode($raw, false, self::MAX_BYTES, $flags);
        if (! $decoded instanceof \stdClass) {
            return null;
        }
        /** @var array<string, mixed> $body */
        $body = json_decode($raw, true, self::MAX_BYTES, $flags);

        return $body;
    }
}

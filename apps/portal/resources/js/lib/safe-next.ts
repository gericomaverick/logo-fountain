// Port of apps/web/src/lib/auth/safe-next.ts (story 4.9b).
const DEFAULT_AUTH_DESTINATION = "/dashboard";
// eslint-disable-next-line no-control-regex -- rejecting control characters is the point
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const ENCODED_PATH_METACHARACTER = /%(?:2f|5c|0[0-9a-f]|1[0-9a-f]|7f|25)/i;

function hasSafePathShape(value: string): boolean {
  return (
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !CONTROL_CHARACTERS.test(value)
  );
}

/**
 * Accept only an application-relative path for post-auth navigation.
 *
 * Only the pathname is decoded and checked; query and fragment data are preserved. This keeps
 * values such as /%2fexample.com, /%5cexample.com, encoded control characters,
 * and double-encoded variants from becoming unsafe after another layer decodes
 * them. The original (not additionally decoded) path is returned on success.
 */
export function safeAuthNextPath(raw: string | null | undefined, fallback = DEFAULT_AUTH_DESTINATION): string {
  const pathname = raw?.split(/[?#]/, 1)[0] ?? "";
  if (!raw || !hasSafePathShape(pathname)) return fallback;

  let decoded = pathname;
  // Decode once to inspect normal encoding, then continue only while a nested
  // encoding can become a slash, backslash, control byte, or another encoded
  // layer. Successful nested decoding shortens the value, so raw.length is a
  // safe upper bound for deliberately deep %25 layers.
  for (let pass = 0; pass < raw.length && decoded.includes("%"); pass += 1) {
    try {
      const nextDecoded = decodeURIComponent(decoded);
      if (!hasSafePathShape(nextDecoded)) return fallback;
      decoded = nextDecoded;
      if (!ENCODED_PATH_METACHARACTER.test(decoded)) break;
    } catch {
      return fallback;
    }
  }

  return raw;
}

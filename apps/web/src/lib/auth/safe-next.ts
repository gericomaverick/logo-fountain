const DEFAULT_AUTH_DESTINATION = "/dashboard";
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
 * Each encoded representation is checked as well as the raw value. This keeps
 * values such as /%2fexample.com, /%5cexample.com, encoded control characters,
 * and double-encoded variants from becoming unsafe after another layer decodes
 * them. The original (not additionally decoded) path is returned on success.
 */
export function safeAuthNextPath(raw: string | null | undefined, fallback = DEFAULT_AUTH_DESTINATION): string {
  if (!raw || !hasSafePathShape(raw)) return fallback;

  let decoded = raw;
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

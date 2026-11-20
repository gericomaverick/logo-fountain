# Story 1.5: Trusted client address

- **Status:** in-progress
- **Covers:** X-05, ADR-010 · **Gate:** Pest · **DoD variant:** Laravel-only (gate is Pest; the epics "Conversion" label for this story is about porting a Next module, there is no `@api`/`@ui` gate) · **After:** 1.3
- **AC (epics.md:202-204):** every `client-address.test.ts` case is ported. A list value or invalid IP gives an unknown address.

## Inventory scope
`X-05` (Trusted client IP only from `AUTH_CLIENT_IP_HEADER` or `AUTH_TRUSTED_PROXY_HOPS`; otherwise per-IP limits are off). A-17's production fail-closed was built in 1.3; this story only re-points it at the full port.

## Next.js source read
- `apps/web/src/lib/auth/client-address.ts` (whole file, 29 lines), `client-address.test.ts` (7 `it` blocks), `proxy-config.mjs` (14 lines), `scripts/auth-proxy-preflight.mjs`.
- Callers: `src/lib/auth/http.ts:15` (production `authProxyUnavailable`), `http.ts:47` (general auth limiter: address bucket), `src/app/api/auth/login/route.ts:12` (login address + failure buckets), `src/lib/auth/rate-limit.ts:32` (comment). Audit never records the address.
- Docs: `brownfield/auth-and-security.md` §1 (step 1), §7, §8; `architecture.md` §4.1, §4.5, §7 gap 3; `adr/ADR-010`; inventory X-05; `test-port-ledger.md` row 67; story 1.3 record (follow-up for 1.5).
- Node itself: `lib/internal/net.js` at v24.22.2 (the `IPv4Reg`/`IPv6Reg` behind `net.isIP`), and Node's HTTP header decoding (probe below).

## Behaviour notes (written before converting)
Quoted rules:
- **Config** (`proxy-config.mjs:4-14`): `header = env.AUTH_CLIENT_IP_HEADER?.trim().toLowerCase()`, `hops = env.AUTH_TRUSTED_PROXY_HOPS?.trim()`. `if (Boolean(header) === Boolean(hops)) return null` (both or neither). Header: `/^[a-z][a-z0-9-]*$/` and not in `["host","origin","referer","cookie","authorization"]` → `{header}`, else null. Hops: `/^[1-9]\d?$/` → `{hops: Number(hops)}` (1–99), else null.
- **Derivation** (`client-address.ts:15-29`): no config → `null`, and forwarding headers are never read. Header mode: `headers.get(config.header)?.trim() ?? ""`; `isIP(value) ? value : null` ("a list means it appended"). Hops mode: `(headers.get("x-forwarded-for") ?? "").split(",").map(trim)`; `chain.length >= hops ? chain[chain.length - hops] : ""`; `isIP(value) ? value : null`. The returned value is the trimmed string as written (no normalisation: `2001:DB8::1` stays upper case, no compression).
- **Unknown address** (`http.ts:14-17`): in production every auth route answers `503 {error:{code:"AUTH_UNAVAILABLE",message:"Authentication is temporarily unavailable."}}`. Outside production, `null` only means the per-address buckets are skipped (identity buckets still apply; login failure key uses `unknown-address`).
- **Preflight** (`auth-proxy-preflight.mjs`): exit 1 with "Auth proxy preflight failed: set exactly one valid AUTH_CLIENT_IP_HEADER or AUTH_TRUSTED_PROXY_HOPS" in production (or `--production`) without valid config; dev needs none. Ported in 1.3 (`proxy:preflight`).

Edge semantics the PHP port must match (Node probed in Docker, `node:24.22.2-alpine3.23`):
1. **`net.isIP` is a regex** (`lib/internal/net.js`): IPv4 segments `25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9]`, so **leading zeros are invalid** (`01.2.3.4`); IPv6 is the 8-alternative regex with an optional embedded v4 tail and an **optional zone ID `%[0-9a-zA-Z-.:]+`** (so `fe80::1%eth0` is valid, `fe80::1%a_b` is not). JS `$` without `m` doesn't match before a trailing `\n`. PHP's `filter_var(FILTER_VALIDATE_IP)` rejects zone IDs, so it differs → port the regex (with `/D`), don't use `filter_var`.
2. **Header values reach Next as latin1** (one char per byte). `String.prototype.trim` strips 25 code points; in latin1 that is bytes `09-0D`, `20` and **`A0`**. Probe: `X-Real-IP: 1.2.3.4\xA0` → trimmed `1.2.3.4`, `isIP` 4 (valid); UTF-8 NBSP `C2 A0` → `1.2.3.4\xC2` (invalid). PHP's `trim()` strips `\0` and not `\f`/`\xA0` → custom trim.
3. **Repeated headers are joined with `", "`** by Node (`X-Forwarded-For`, `CF-Connecting-IP`, `X-Real-IP` all probed), so two `CF-Connecting-IP` lines are a list → unknown. nginx 1.28 joins them the same way before FastCGI (probed: `HTTP_X_FORWARDED_FOR = "1.1.1.1, 2.2.2.2"`).
4. **Header names with `_`**: Node's `Headers` never maps `X_Real_IP` to `x-real-ip`; PHP/CGI would (`HTTP_X_REAL_IP`). nginx drops underscore headers by default (`underscores_in_headers off`; probed: `X_Real_IP` never reached FPM). Keep that default.
5. Env values are UTF-8 in Node: `trim()` strips Unicode whitespace there, and `toLowerCase()` maps `K` (U+212A KELVIN SIGN) to ASCII `k`. Port with a Unicode trim and `mb_strtolower`.

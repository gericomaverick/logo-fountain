# Story 1.5: Trusted client address

- **Status:** review (branch `worktree-agent-ab0ca23be7c3bd12d`, not pushed)
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

## Laravel implementation
| Behaviour | Where |
|---|---|
| Node primitives: `net.isIP` regex (from `lib/internal/net.js` v24.22.2, `/D`), JS trim on latin1 header bytes, JS trim + `toLowerCase` on UTF-8 env values | `apps/portal/app/Support/NodeCompat.php` |
| Config rule (now JS trim/lowercase) | `app/Support/AuthProxyConfig.php:26,43` |
| Derivation (`trusted()`), memoised read (`for()`), `Headers.get` join | `app/Support/ClientAddress.php` |
| Global middleware storing `ClientAddress::ATTRIBUTE` (never rejects) | `app/Http/Middleware/TrustedClientAddress.php`; registered in `bootstrap/app.php` (`append`) |
| Framework proxy trust off (`$middleware->remove(TrustProxies::class)`) | `bootstrap/app.php` |
| Production fail-closed reads the memoised address | `app/Http/Middleware/EnsureAuthAvailable.php:23` |
| Dev nginx = the edge: overwrites `CF-Connecting-IP` and `X-Real-IP` with `$remote_addr`, `X-Forwarded-For` with `$proxy_add_x_forwarded_for`; underscore headers stay dropped | `docker/nginx/default.conf` |
| Dev uses the production mode (`AUTH_CLIENT_IP_HEADER=cf-connecting-ip`); Pest starts with none | `.env.example:77-80`, `phpunit.xml:38-40` |
| `GET /dev/client-address` (local/testing only): what each rule derives, for the nginx test | `routes/web.php` |
| CI starts `web` so the nginx test runs | `.github/workflows/portal.yml` (stack step) |

**TrustProxies / `$request->ip()` decision:** don't configure `TrustProxies`; remove it. `trustProxies(at: [])` doesn't help: `[] ?: config(...)` is null, and on `*.on-forge.com` hosts (Forge's default domain) or Laravel Cloud the framework then trusts `*` (`vendor/.../Http/Middleware/TrustProxies.php`, `setTrustedProxyIpAddresses`). With it gone, `ip()` = `REMOTE_ADDR`, `isSecure()` = nginx's `HTTPS` (TLS terminates on nginx with the Origin CA cert, arch §4.5), host = `Host`. The only client address is `ClientAddress::for()`. Laravel's DB session `ip_address` column gets `ip()` (the peer; informational only).

**Ordering:** arch §4.1 lists TrustedClientAddress after RequireCanonicalOrigin. It never short-circuits, so its position relative to the origin guard (1.4) doesn't change behaviour; it is appended to the global stack.

### Production nginx (Forge, Epic 9: proposal, not built)
Cloudflare sets `CF-Connecting-IP`, and the Hetzner firewall admits only Cloudflare ranges. Defence in depth if the firewall is ever open: nginx trusts the header only from Cloudflare peers and otherwise overwrites it with the real peer.
```nginx
# http {} (e.g. /etc/nginx/conf.d/cloudflare.conf); ranges from cloudflare.com/ips-v4 and /ips-v6, refreshed by cron
set_real_ip_from 173.245.48.0/20;   # ... every Cloudflare v4 and v6 range
real_ip_header CF-Connecting-IP;
# site, location ~ \.php$, after `include fastcgi_params;`
fastcgi_param HTTP_CF_CONNECTING_IP $remote_addr;   # CF's value from a CF peer, else the peer itself
fastcgi_param HTTP_X_REAL_IP $remote_addr;
fastcgi_param HTTP_X_FORWARDED_FOR $remote_addr;     # not read in header mode
```
Keep `underscores_in_headers off`. L9 check for Epic 9: from a non-Cloudflare peer, a forged `CF-Connecting-IP` must not become the client address.

## Deviations from Next.js
| Behaviour | Next.js | Laravel | Why | Decision ref |
|---|---|---|---|---|
| Peer address | Route handlers can't see the socket peer | `ip()` exists but is the peer only, never used for limits | Same rule; a Pest scan forbids `->ip()` in `app/` | ADR-010 |
| Header-name spelling | `X_Real_IP` is a different header | PHP/CGI would map it to `HTTP_X_REAL_IP`; nginx drops underscore headers (default, noted in `default.conf`, tested) | Infra keeps parity | this record |
| Preflight | Proxy config only | Also `PUBLIC_SITE_URL` | 1.3 decision | story 1.3 |

None in derived results: every Next case and every fixture input gives the same answer.

## Tests
| Layer | Test file / title | Inventory IDs |
|---|---|---|
| L1 Pest unit | `tests/Unit/ClientAddressTest.php`: Next #1–#5 and #7 (same titles, same assertions) + 7 edge-case tests | X-05 |
| L1 Pest unit | `tests/Unit/NodeCompatTest.php`: 3493 Node `isIP` inputs, the filter_var difference, 25 trim code points (UTF-8 and latin1) | X-05 |
| L2 Pest feature | `tests/Feature/ClientAddressPreflightTest.php`: Next #6 on a real `artisan proxy:preflight` process | X-05, O-05 |
| L2 Pest feature | `tests/Feature/TrustedClientAddressTest.php`: middleware memo; forged `X-Forwarded-*`/`Forwarded` don't move `ip()`/`isSecure()`/host (incl. `*.on-forge.com`); production 503 vs Node-accepted values; debug route; `->ip()` scan | X-05, A-17 |
| L2 through nginx + FPM | `tests/Feature/NginxClientAddressTest.php`: forged CF-Connecting-IP / X-Real-IP / X-Forwarded-For / underscore spellings / duplicates → the peer | X-05 (arch §7 gap 3, dev half) |

**`client-address.test.ts`: 7/7 `it` blocks ported** (6 in `ClientAddressTest`, #6 in `ClientAddressPreflightTest`), all assertions kept.
Test-port ledger: row 67 → **proposal for the parent** (shared file not edited): `Pest unit | tests/Unit/ClientAddressTest.php + tests/Feature/ClientAddressPreflightTest.php | Ported`.

## Test evidence
- `bin/test` (stack `lf-1-5`): check-agents-guide ✓ · Pint ✓ · Larastan 9 ✓ · **Pest 238 passed (688 assertions), 0 failed**.
- Story files alone: 46 passed (130 assertions).
- Mutation: without `fastcgi_param HTTP_CF_CONNECTING_IP` in `default.conf`, `NginxClientAddressTest` 2/2 fail; restored, they pass.
- Node probes (`node:24.22.2-alpine3.23`): header decoding (NBSP byte kept as U+00A0 and trimmed; VT/FF/NUL → 400; duplicates joined; underscore name separate) and the fixture generator `tests/Fixtures/node-net/generate.mjs`.
- nginx probes (a temporary `public/` script, removed): duplicates joined `", "` before FastCGI; `X_Real_IP` dropped; after the change forged values are replaced by the peer, with no duplicate params.

**Not run, and why:** apps/web Vitest `client-address.test.ts` (frozen, unchanged; Node behaviour was checked directly). Parity suite (gate is Pest; no Laravel auth endpoints yet). GitHub CI (not pushed).

## Gotchas
Proposed for `apps/portal/AGENTS.md` §8 (not edited here):
1. Never `$request->ip()` for limits or audit: use `ClientAddress::for($request)`. `TrustProxies` is removed on purpose (it trusts `*` on `*.on-forge.com`); don't add it back (1.5).
2. Porting a JS rule: JS `$` = PHP `$` with `/D`; the `trim()` sets differ (JS strips `\f` and NBSP, PHP strips `\0`). Use `App\Support\NodeCompat` (1.5).
3. Pest runs with no proxy config (`phpunit.xml`), but the dev `.env` and FPM use `cf-connecting-ip` (1.5).
4. `NginxClientAddressTest` needs the `web` service (`docker compose up` starts it; CI now does) (1.5).

Other: `docker compose up -d --build` on a fresh project name failed once with `image "lf-1-5-php:dev": already exists` (app and worker build the same tag in parallel); a plain `up -d` then worked.

## Docs updated
ADR-010 Consequences (story 1.5 line); this record. **Left to the parent:** inventory, sprint-status, handoff, ledger, AGENTS.md, DECISIONS/RISKS/ASSUMPTIONS.

### Proposals for the parent to log
- **Inventory X-05:** Laravel = `Support/ClientAddress.php`, `Support/NodeCompat.php`, `Middleware/TrustedClientAddress.php`; Tests as above; **Verified** (Laravel-only DoD, gate Pest).
- **sprint-status:** `1-5-trusted-client-address: done` after merge.
- **DECISIONS:** remove Laravel `TrustProxies`; the client address only via `ClientAddress` (ADR-010).
- **DECISIONS:** port Node `net.isIP` exactly (IPv6 zone IDs accepted, as Next) instead of `filter_var`.
- **RISKS:** production nginx must overwrite `CF-Connecting-IP` from non-Cloudflare peers (realip + `fastcgi_param`); not built until Epic 9.
- **ASSUMPTIONS:** Next (Node http) decodes header values as latin1 (verified on Node 24.22.2).

## Open items
- **Epic 9 (Forge):** the production nginx snippet above, Cloudflare range refresh, the L9 forged-header check (arch §7 gap 3, production half).
- **Epic 4 (rate limits):** use `ClientAddress::for($request)` for the address bucket and `unknown-address` in the login failure key (brownfield §8).
- **Merge with 1.4/1.8a:** `bootstrap/app.php`, `routes/web.php` and the `portal.yml` stack step are touched; small conflicts possible.

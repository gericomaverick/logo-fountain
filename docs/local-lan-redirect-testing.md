# Local LAN + Redirect Testing Notes (WSL2)

## 1) Run the app for LAN devices

1. Start from `projects/logo-fountain/apps/web`.
2. Run the dev server on all interfaces:
   ```bash
   npm run dev -- --hostname 0.0.0.0 --port 3000
   ```
3. On Windows host, confirm inbound firewall rule allows TCP 3000.
4. From another device on the same LAN, open:
   - `http://<windows-host-lan-ip>:3000`

## 2) Supabase redirect allow-list (auth callbacks)

In Supabase Auth URL settings, include all local origins used during testing:

- `http://localhost:3000`
- `http://127.0.0.1:3000`
- `http://<windows-host-lan-ip>:3000`

If using a custom callback path, add that exact URL too (e.g. `/auth/callback`).

## 3) Stripe checkout return URLs

For local testing, ensure checkout success/cancel URLs point back to the same origin used to start checkout.

Recommended pattern in app config:
- derive base URL from request origin when available
- fallback to configured local origin for CLI/API-triggered flows

Verify both work:
- browser started at `localhost`
- browser started from LAN IP

## 4) Quick validation checklist

- Start checkout from pricing/project upsell on LAN URL.
- Confirm Stripe returns to the same LAN origin (not `localhost`).
- Confirm `/checkout/success` and project entitlements refresh normally.
- Confirm Supabase magic-link/login redirects to the same origin used at sign-in.

## 5) Common failure mode

If redirect jumps between `localhost` and LAN IP, cookies/session can appear missing.
Keep each test run origin-consistent end-to-end.

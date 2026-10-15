import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Security regression net: every API route must either enforce authentication
 * or be explicitly listed as public below. Adding a new route without a guard
 * (or without updating this allowlist deliberately) fails the suite.
 */

const API_DIR = path.join(__dirname);

// Routes that intentionally serve unauthenticated traffic. Each entry should
// have a reason so reviewers can challenge it.
const PUBLIC_ROUTES: Record<string, string> = {
  "health/route.ts": "Uptime probe; returns static ok only.",
  "stripe/webhook/route.ts": "Stripe server-to-server; guarded by signature verification instead.",
  "checkout/status/route.ts": "Post-payment polling by session_id before the account exists.",
  "checkout/magic-link/route.ts": "Post-payment sign-in bootstrap keyed on the Stripe session_id.",
  "checkout/resend-magic-link/route.ts": "Post-payment email resend keyed on the Stripe session_id; rate limited.",
  "auth/forgot-password/route.ts": "Password recovery must be public; response is uniform and requests are rate limited.",
  "auth/logout/route.ts": "Clears the caller's own session cookie; no data exposure.",
  "auth/session/route.ts": "Reports the caller's own session state; no data exposure.",
};

// Public server-to-server or possession-token POSTs do not rely on browser
// cookies, so CSRF Origin enforcement is not their authentication boundary.
const MUTATION_ORIGIN_EXEMPTIONS: Record<string, string> = {
  "stripe/webhook/route.ts": "Stripe signature authenticates the exact raw body.",
  "checkout/magic-link/route.ts": "Public post-checkout possession-token flow; independently rate limited.",
  "checkout/resend-magic-link/route.ts": "Public post-checkout possession-token flow; independently rate limited.",
};

function findRouteFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findRouteFiles(full));
    } else if (entry.name === "route.ts") {
      results.push(full);
    }
  }
  return results;
}

const routeFiles = findRouteFiles(API_DIR);
const relative = (file: string) => path.relative(API_DIR, file);

describe("API route auth guards", () => {
  it("discovers API routes (sanity check)", () => {
    expect(routeFiles.length).toBeGreaterThanOrEqual(40);
  });

  it("has no stale entries in the public allowlist", () => {
    const existing = new Set(routeFiles.map(relative));
    for (const publicRoute of Object.keys(PUBLIC_ROUTES)) {
      expect(existing, `Allowlisted route no longer exists: ${publicRoute}`).toContain(publicRoute);
    }
  });

  for (const file of routeFiles) {
    const rel = relative(file);
    if (PUBLIC_ROUTES[rel]) continue;

    it(`${rel} enforces authentication`, () => {
      const content = fs.readFileSync(file, "utf8");
      const guarded =
        /\brequireUser\s*\(/.test(content) ||
        // Session-derived flows that read the user via the server client.
        /supabase\.auth\.getUser\s*\(/.test(content);

      expect(
        guarded,
        `${rel} has no auth guard (requireUser or supabase.auth.getUser). ` +
          "If this route is intentionally public, add it to PUBLIC_ROUTES with a reason.",
      ).toBe(true);
    });
  }

  for (const file of routeFiles) {
    const rel = relative(file);
    const content = fs.readFileSync(file, "utf8");
    const mutates = /export async function (?:POST|PUT|PATCH|DELETE)\b/.test(content);
    if (!mutates || MUTATION_ORIGIN_EXEMPTIONS[rel]) continue;

    it(`${rel} enforces canonical Origin for mutations`, () => {
      expect(
        content,
        `${rel} mutates state without the shared canonical Origin guard. ` +
          "If it is genuinely public and cookie-independent, document and allowlist it deliberately.",
      ).toMatch(/rejectUntrustedMutationOrigin\s*\(/);
    });
  }

  for (const file of routeFiles) {
    const rel = relative(file);
    if (!rel.startsWith("admin/")) continue;

    it(`${rel} enforces admin role`, () => {
      const content = fs.readFileSync(file, "utf8");
      expect(
        /\brequireAdmin\s*\(/.test(content),
        `${rel} is under /api/admin but never calls requireAdmin.`,
      ).toBe(true);
    });
  }

  it("verifies the Stripe webhook checks signatures", () => {
    const content = fs.readFileSync(path.join(API_DIR, "stripe/webhook/route.ts"), "utf8");
    expect(content).toMatch(/webhooks\.constructEvent\s*\(/);
    expect(content).toMatch(/stripe-signature/);
  });

  it("keeps the admin pages behind the admin layout guard", () => {
    const layout = fs.readFileSync(path.join(__dirname, "../admin/layout.tsx"), "utf8");
    expect(layout).toMatch(/isAdminUser\s*\(/);
    expect(layout).toMatch(/redirect\s*\(/);
  });
});

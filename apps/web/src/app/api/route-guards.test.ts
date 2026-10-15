import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

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
  "auth/login/route.ts": "Password verification and fenced session creation; no signup.",
  "auth/magic-link/route.ts": "Uniform rate-limited email request; existing identities only.",
  "auth/magic-link/verify/route.ts": "Single-use epoch-bound mailbox proof exchange, fenced transaction.",
  "auth/reset-password/route.ts": "Single-use epoch-bound setup/recovery proof, fenced transaction.",
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
        // Session-derived flows use the DB-backed server reader.
        /getCurrentUser\s*\(/.test(content);

      expect(
        guarded,
        `${rel} has no auth guard (requireUser or getCurrentUser). ` +
          "If this route is intentionally public, add it to PUBLIC_ROUTES with a reason.",
      ).toBe(true);
    });
  }

  for (const file of routeFiles) {
    const rel = relative(file);
    if (MUTATION_ORIGIN_EXEMPTIONS[rel]) continue;
    it(`${rel} guards each mutation before other work`, () => {
      const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
      for (const statement of source.statements) {
        // Require the explicit handler form: alternate export syntax must get
        // deliberate review rather than silently escaping guard discovery.
        if (ts.isExportDeclaration(statement) && statement.exportClause) {
          expect(statement.exportClause.getText(source)).not.toMatch(/\b(?:POST|PUT|PATCH|DELETE)\b/);
        }
        if (ts.isVariableStatement(statement) && statement.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
          for (const declaration of statement.declarationList.declarations) {
            expect(declaration.name.getText(source)).not.toMatch(/^(?:POST|PUT|PATCH|DELETE)$/);
          }
        }
        if (!ts.isFunctionDeclaration(statement) || !statement.name ||
          !/^(?:POST|PUT|PATCH|DELETE)$/.test(statement.name.text)) continue;
        const [guard, reject] = statement.body?.statements ?? [];
        // Approved wrapper is tested independently, including zero work on rejection.
        if (rel.startsWith("auth/") && guard && ts.isReturnStatement(guard) && guard.expression && ts.isCallExpression(guard.expression) && guard.expression.expression.getText(source) === "authMutation") {
          expect(statement.body?.statements.length).toBe(1);
          expect(guard.expression.arguments[0]?.getText(source)).toBe(statement.parameters[0]?.name.getText(source));
          expect(guard.expression.arguments.length).toBe(2);
          continue;
        }
        expect(guard && ts.isVariableStatement(guard), `${rel}: guard must be first`).toBe(true);
        if (!guard || !ts.isVariableStatement(guard)) continue;
        const declaration = guard.declarationList.declarations[0];
        const call = declaration.initializer;
        expect(call && ts.isCallExpression(call) && call.expression.getText(source) === "rejectUntrustedMutationOrigin").toBe(true);
        if (!call || !ts.isCallExpression(call)) continue;
        expect(call.arguments[0]?.getText(source)).toBe(statement.parameters[0]?.name.getText(source));
        expect(reject && ts.isIfStatement(reject), `${rel}: must return rejected response`).toBe(true);
        if (!reject || !ts.isIfStatement(reject)) continue;
        expect(reject.expression.getText(source)).toBe(declaration.name.getText(source));
        const returned = ts.isBlock(reject.thenStatement) ? reject.thenStatement.statements[0] : reject.thenStatement;
        expect(ts.isReturnStatement(returned) && returned.expression?.getText(source)).toBe(declaration.name.getText(source));
      }
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

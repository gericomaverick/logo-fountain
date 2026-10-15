import Stripe from "stripe";

import { requireAdmin, requireUser, toRouteErrorResponse } from "@/lib/auth/require";
import { prisma } from "@/lib/prisma";
import { STRIPE_PLACEHOLDER_PRICE_IDS } from "@/lib/stripe";
import { checkPrivateStorageHealth } from "@/lib/storage/r2";
import {
  STORAGE_BUCKET_CONCEPTS,
  STORAGE_BUCKET_FINAL_DELIVERABLES,
} from "@/lib/storage/r2";

export const runtime = "nodejs";

type CheckResult = {
  key: string;
  label: string;
  passed: boolean;
  summary: string;
  nextStep: string;
  details?: Record<string, unknown>;
};

function envPresent(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function envCheck(name: string, label = name): CheckResult {
  const passed = envPresent(name);
  return {
    key: `env:${name}`,
    label,
    passed,
    summary: passed ? "Present" : "Missing",
    nextStep: passed ? "No action needed." : `Set ${name} in your deployment env and redeploy.`,
  };
}

function publicSiteUrlCheck(): CheckResult {
  const value = process.env.PUBLIC_SITE_URL?.trim();
  if (!value) return envCheck("PUBLIC_SITE_URL", "Public site URL");

  try {
    const url = new URL(value);
    const isHttp = url.protocol === "http:" || url.protocol === "https:";
    const hasNoCredentials = !url.username && !url.password;
    const isSecureProduction = process.env.NODE_ENV !== "production" || url.protocol === "https:";
    const passed = isHttp && hasNoCredentials && isSecureProduction;
    return {
      key: "env:PUBLIC_SITE_URL",
      label: "Public site URL",
      passed,
      summary: passed ? `Valid canonical origin: ${url.origin}` : "Must resolve to an HTTP(S) origin without credentials; production requires HTTPS",
      nextStep: passed ? "No action needed." : "Set PUBLIC_SITE_URL to the canonical HTTPS production origin (for example https://example.com).",
    };
  } catch {
    return {
      key: "env:PUBLIC_SITE_URL",
      label: "Public site URL",
      passed: false,
      summary: "Invalid URL",
      nextStep: "Set PUBLIC_SITE_URL to the canonical HTTPS production origin (for example https://example.com).",
    };
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

export async function GET() {
  try {
    const user = await requireUser();
    await requireAdmin(user);

    const checks: CheckResult[] = [
      envCheck("BETTER_AUTH_SECRET", "Authentication secret"),
      envCheck("R2_ACCOUNT_ID"),
      envCheck("R2_ACCESS_KEY_ID"),
      envCheck("R2_SECRET_ACCESS_KEY"),
      envCheck("R2_CONCEPTS_BUCKET"),
      envCheck("R2_FINAL_DELIVERABLES_BUCKET"),
      envCheck("STRIPE_SECRET_KEY", "Stripe secret key"),
      envCheck("STRIPE_WEBHOOK_SECRET", "Stripe webhook secret"),
      envCheck("POSTMARK_SERVER_TOKEN", "Postmark server token"),
      envCheck("POSTMARK_FROM", "Postmark sender"),
      publicSiteUrlCheck(),
      envCheck("ADMIN_NOTIFICATION_EMAILS", "Admin notification recipients (not authorization)"),
    ];

    checks.push({
      key: "stripe_allowlist",
      label: "Stripe allowlist",
      passed: STRIPE_PLACEHOLDER_PRICE_IDS.length === 0,
      summary:
        STRIPE_PLACEHOLDER_PRICE_IDS.length === 0
          ? "All package codes map to real Stripe price IDs"
          : `Placeholder price IDs detected: ${STRIPE_PLACEHOLDER_PRICE_IDS
              .map(({ scope, key, priceId }) => `${scope}:${key}=${priceId || "<empty>"}`)
              .join(", ")}`,
      nextStep:
        STRIPE_PLACEHOLDER_PRICE_IDS.length === 0
          ? "No action needed."
          : "Update src/lib/stripe.ts.",
      details:
        STRIPE_PLACEHOLDER_PRICE_IDS.length === 0
          ? undefined
          : {
              placeholders: STRIPE_PLACEHOLDER_PRICE_IDS,
            },
    });

    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.push({
        key: "db:connectivity",
        label: "Database connectivity",
        passed: true,
        summary: "Connected",
        nextStep: "No action needed.",
      });
    } catch (error) {
      checks.push({
        key: "db:connectivity",
        label: "Database connectivity",
        passed: false,
        summary: `Failed: ${formatError(error)}`,
        nextStep: "Verify DATABASE_URL, network access, and that Postgres is up.",
      });
    }

    if (envPresent("STRIPE_SECRET_KEY")) {
      try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-02-25.clover" });
        const account = await stripe.accounts.retrieve();

        checks.push({
          key: "stripe:connectivity",
          label: "Stripe API connectivity",
          passed: true,
          summary: "Connected",
          nextStep: "No action needed.",
          details: { accountId: account.id },
        });
      } catch (error) {
        checks.push({
          key: "stripe:connectivity",
          label: "Stripe API connectivity",
          passed: false,
          summary: `Failed: ${formatError(error)}`,
          nextStep: "Check STRIPE_SECRET_KEY and outbound network access to api.stripe.com.",
        });
      }
    } else {
      checks.push({
        key: "stripe:connectivity",
        label: "Stripe API connectivity",
        passed: false,
        summary: "Skipped (missing STRIPE_SECRET_KEY)",
        nextStep: "Set STRIPE_SECRET_KEY to run this check.",
      });
    }

    try {
      const results = await checkPrivateStorageHealth();
      for (const result of results) checks.push({
        key: `r2:bucket:${result.bucket}`, label: `Private R2 bucket: ${result.bucket}`,
        passed: result.passed,
        summary: result.passed ? "Private storage reachable" : "Private storage check failed",
        nextStep: result.passed ? "No action needed." : "Verify private bucket configuration and scoped credentials; no bucket is created automatically.",
      });
    } catch {
      for (const bucket of [STORAGE_BUCKET_CONCEPTS, STORAGE_BUCKET_FINAL_DELIVERABLES]) checks.push({
        key: `r2:bucket:${bucket}`, label: `Private R2 bucket: ${bucket}`, passed: false,
        summary: "Private storage configuration unavailable", nextStep: "Configure R2 server-only variables and private buckets.",
      });
    }

    const failedCount = checks.filter((check) => !check.passed).length;

    return Response.json({
      ok: failedCount === 0,
      summary: {
        total: checks.length,
        passed: checks.length - failedCount,
        failed: failedCount,
      },
      checks,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return toRouteErrorResponse(error);
  }
}

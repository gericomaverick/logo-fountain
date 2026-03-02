import Stripe from "stripe";

import { requireAdmin, requireUser, toRouteErrorResponse } from "@/lib/auth/require";
import { prisma } from "@/lib/prisma";
import {
  SUPABASE_STORAGE_BUCKET_CONCEPTS,
  SUPABASE_STORAGE_BUCKET_FINAL_DELIVERABLES,
} from "@/lib/supabase/storage";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

export async function GET() {
  try {
    const user = await requireUser();
    await requireAdmin(user);

    const checks: CheckResult[] = [
      envCheck("NEXT_PUBLIC_SUPABASE_URL", "Supabase URL"),
      envCheck("NEXT_PUBLIC_SUPABASE_ANON_KEY", "Supabase anon key"),
      envCheck("SUPABASE_SERVICE_ROLE_KEY", "Supabase service role key"),
      envCheck("STRIPE_SECRET_KEY", "Stripe secret key"),
      envCheck("STRIPE_WEBHOOK_SECRET", "Stripe webhook secret"),
      envCheck("ADMIN_EMAILS", "Admin emails allowlist"),
    ];

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

    if (envPresent("NEXT_PUBLIC_SUPABASE_URL") && envPresent("SUPABASE_SERVICE_ROLE_KEY")) {
      try {
        const admin = createSupabaseAdminClient();
        const { data, error } = await admin.storage.listBuckets();

        if (error) throw error;

        const bucketNames = new Set((data ?? []).map((bucket) => bucket.name));
        const requiredBuckets = [SUPABASE_STORAGE_BUCKET_CONCEPTS, SUPABASE_STORAGE_BUCKET_FINAL_DELIVERABLES];

        for (const bucketName of requiredBuckets) {
          const exists = bucketNames.has(bucketName);
          checks.push({
            key: `supabase:bucket:${bucketName}`,
            label: `Supabase bucket: ${bucketName}`,
            passed: exists,
            summary: exists ? "Exists" : "Missing",
            nextStep: exists
              ? "No action needed."
              : `Create bucket '${bucketName}' in Supabase Storage (Dashboard → Storage).`,
          });
        }
      } catch (error) {
        for (const bucketName of [SUPABASE_STORAGE_BUCKET_CONCEPTS, SUPABASE_STORAGE_BUCKET_FINAL_DELIVERABLES]) {
          checks.push({
            key: `supabase:bucket:${bucketName}`,
            label: `Supabase bucket: ${bucketName}`,
            passed: false,
            summary: `Failed to verify: ${formatError(error)}`,
            nextStep: "Check SUPABASE_SERVICE_ROLE_KEY permissions and Supabase API reachability.",
          });
        }
      }
    } else {
      for (const bucketName of [SUPABASE_STORAGE_BUCKET_CONCEPTS, SUPABASE_STORAGE_BUCKET_FINAL_DELIVERABLES]) {
        checks.push({
          key: `supabase:bucket:${bucketName}`,
          label: `Supabase bucket: ${bucketName}`,
          passed: false,
          summary: "Skipped (missing Supabase env vars)",
          nextStep: "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to run this check.",
        });
      }
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

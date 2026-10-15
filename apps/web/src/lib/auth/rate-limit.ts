import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
const key = (s: string) => createHash("sha256").update(s).digest("hex");
const WINDOW_MS = 15 * 60000;
export const ADDRESS_LIMIT = 20;
export const IDENTITY_LIMIT = 5;
export const LOGIN_FAILURE_LIMIT = 5;

// Atomic shared PostgreSQL buckets; no tokens/emails/addresses stored in clear.
async function hit(tx: Prisma.TransactionClient, bucket: string, now: Date) {
  const cutoff = new Date(now.getTime() - WINDOW_MS);
  const rows = await tx.$queryRaw<Array<{ hits: number }>>`
    INSERT INTO "AuthRateLimit" ("key", "hits", "windowStart") VALUES (${bucket}, 1, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "hits" = CASE WHEN "AuthRateLimit"."windowStart" < ${cutoff} THEN 1 ELSE LEAST("AuthRateLimit"."hits" + 1, 100000) END,
      "windowStart" = CASE WHEN "AuthRateLimit"."windowStart" < ${cutoff} THEN ${now} ELSE "AuthRateLimit"."windowStart" END
    RETURNING "hits"`;
  return rows[0].hits;
}
async function consume(buckets: Array<[string, number]>) {
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    await tx.authRateLimit.deleteMany({ where: { windowStart: { lt: new Date(now.getTime() - 3600000) } } });
    let allowed = true;
    for (const [bucket, max] of buckets) if ((await hit(tx, bucket, now)) > max) allowed = false;
    return allowed;
  });
}
// address is null when no trusted proxy setting identifies the client; then only
// the identity bucket applies (see trustedClientAddress).
export async function consumeAuthLimit(scope: string, address: string | null, identity: string) {
  return consume([
    ...(address ? [[key(scope + ":address:" + address), ADDRESS_LIMIT] as [string, number]] : []),
    [key(scope + ":identity:" + identity), IDENTITY_LIMIT],
  ]);
}

// Login: the per-address bucket counts every attempt; the per-email bucket counts
// FAILURES only. It is reserved before the password check (so parallel guesses
// cannot overshoot) and cleared on success, so a successful sign-in never spends
// the budget. With a trusted address the failure budget is per (email, address):
// a third party elsewhere cannot lock the owner out.
const loginFailureKey = (address: string | null, email: string) => key("login:failures:" + email + ":" + (address ?? "unknown-address"));
export async function reserveLoginAttempt(address: string | null, email: string) {
  return consume([
    ...(address ? [[key("/api/auth/login:address:" + address), ADDRESS_LIMIT] as [string, number]] : []),
    [loginFailureKey(address, email), LOGIN_FAILURE_LIMIT],
  ]);
}
export async function clearLoginFailures(address: string | null, email: string) {
  await prisma.authRateLimit.deleteMany({ where: { key: loginFailureKey(address, email) } });
}

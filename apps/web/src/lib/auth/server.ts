import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { magicLink } from "better-auth/plugins";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getSecuritySensitivePublicOrigin } from "@/lib/request-origin";
import { safeAuthNextPath } from "./safe-next";
import { createHash } from "node:crypto";

export const proofHash = (token: string) => createHash("sha256").update(token).digest("hex");
export const SESSION_SECONDS = 7 * 24 * 3600;
export type AuthDatabase = PrismaClient | Prisma.TransactionClient;
// Emails are queued here inside the fenced transaction and sent only AFTER it
// commits (requestAuthLink), so Postmark latency never holds the lock or a
// pooled connection.
export type AuthEmail = { email: string; link: string; kind: "setup" | "reset" | "signin"; tokenHash: string };

// A transaction-bound instance uses the exact same supported adapter and options,
// but does not start nested Prisma transactions: the caller owns the atomic unit.
export function createAuth(db: AuthDatabase = prisma, transactionBound = false, outbox?: AuthEmail[]) {
  const baseURL = getSecuritySensitivePublicOrigin();
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("BETTER_AUTH_SECRET must contain at least 32 random characters");
  function queue(message: AuthEmail) {
    if (!outbox) throw new Error("Authentication email must be issued through requestAuthLink");
    outbox.push(message);
  }
  async function recordProof(userId: string, token: string, kind: string) {
    const user = await db.authUser.findUniqueOrThrow({ where: { id: userId } });
    await db.authProof.create({ data: { tokenHash: proofHash(token), userId, kind, credentialVersion: user.credentialVersion, expiresAt: new Date(Date.now() + 3600000) } });
  }
  return betterAuth({
    baseURL, basePath: "/api/auth/native", secret,
    database: prismaAdapter(db, { provider: "postgresql", transaction: !transactionBound }),
    trustedOrigins: [baseURL],
    advanced: { database: { generateId: "uuid" }, useSecureCookies: baseURL.startsWith("https:") },
    logger: { disabled: true },
    user: { modelName: "AuthUser" },
    account: { modelName: "AuthAccount" },
    session: { modelName: "AuthSession", expiresIn: SESSION_SECONDS, disableSessionRefresh: true, cookieCache: { enabled: false } },
    verification: { modelName: "AuthVerification", storeIdentifier: "hashed" },
    emailAndPassword: {
      enabled: true, disableSignUp: true, requireEmailVerification: true,
      minPasswordLength: 8, maxPasswordLength: 72,
      resetPasswordTokenExpiresIn: 3600, revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, token, url }) => {
        const callback = new URL(new URL(url).searchParams.get("callbackURL") || "/reset-password", baseURL);
        const kind = callback.pathname === "/set-password" ? "setup" : "reset";
        await recordProof(user.id, token, kind);
        const link = new URL(kind === "setup" ? "/set-password" : "/reset-password", baseURL);
        link.hash = new URLSearchParams({ token, next: safeAuthNextPath(callback.searchParams.get("next")) }).toString();
        queue({ email: user.email, link: link.toString(), kind, tokenHash: proofHash(token) });
      },
    },
    plugins: [magicLink({
      expiresIn: 3600, disableSignUp: true, storeToken: "hashed",
      sendMagicLink: async ({ email, token, url }) => {
        const user = await db.authUser.findUniqueOrThrow({ where: { email } });
        await recordProof(user.id, token, "magic");
        const callback = new URL(new URL(url).searchParams.get("callbackURL") || "/dashboard", baseURL);
        const link = new URL("/auth/callback", baseURL);
        link.hash = new URLSearchParams({ token, next: safeAuthNextPath(callback.pathname + callback.search) }).toString();
        queue({ email, link: link.toString(), kind: "signin", tokenHash: proofHash(token) });
      },
    })],
  });
}
let instance: ReturnType<typeof createAuth> | undefined;
export function getAuth() { return instance ??= createAuth(); }

import "server-only";
import { isAPIError } from "better-auth/api";
import { prisma } from "@/lib/prisma";
import { createAuth, getAuth, proofHash, SESSION_SECONDS, type AuthEmail } from "./server";
import { sendAuthEmail } from "./mail";
import type { Prisma } from "@/generated/prisma/client";
import { withCredentialFence } from "./fence";
import { getSecuritySensitivePublicOrigin } from "@/lib/request-origin";
import { safeAuthNextPath } from "./safe-next";
import { validateNewPassword } from "./validation";

import { AuthFailure } from "./errors";
export { AuthFailure } from "./errors";
export const normalizeAuthEmail = (email: string) => email.trim().toLowerCase();
export async function sessionFromHeaders(headers: Headers) {
  const result = await getAuth().api.getSession({ headers, query: { disableCookieCache: true } });
  if (!result) return null;
  if (!result.user.emailVerified || Date.now() >= new Date(result.session.createdAt).getTime() + SESSION_SECONDS * 1000) return null;
  return result;
}
// Returns the kind actually issued (null: no such account), so callers can record it.
export async function requestAuthLink(email: string, kind: "setup" | "reset" | "magic", next = "/dashboard", headers = new Headers()): Promise<"setup" | "reset" | "magic" | null> {
  email = normalizeAuthEmail(email);
  const user = await prisma.authUser.findUnique({ where: { email } });
  if (!user) return null;
  const outbox: AuthEmail[] = [];
  // The fenced transaction only records the hashed proof and queues the email.
  const issued = await withCredentialFence(user.id, async (tx) => {
    const origin = getSecuritySensitivePublicOrigin();
    // Setup may only create a FIRST credential. Re-checked under the fence: once a
    // password exists, the trusted setup path degrades to a sign-in link and can
    // never reset an existing password.
    const effective = kind === "setup" && await hasPasswordCredential(tx, user.id) ? "magic" : kind;
    if (effective === "magic") {
      await createAuth(tx, true, outbox).api.signInMagicLink({ headers, body: { email, callbackURL: origin + safeAuthNextPath(next) } });
    } else {
      const callback = new URL(effective === "setup" ? "/set-password" : "/reset-password", origin);
      callback.searchParams.set("next", safeAuthNextPath(next));
      await createAuth(tx, true, outbox).api.requestPasswordReset({ headers, body: { email, redirectTo: callback.toString() } });
    }
    return effective;
  });
  // Native reset swallows callback errors (runInBackgroundOrAwait); an existing
  // account must always yield exactly one queued link, never a silent "sent".
  if (outbox.length !== 1) throw new Error("Authentication email could not be prepared");
  // Committed; lock and connection released. Send now. On failure, delete the
  // proof so the undelivered link is dead (proof checks gate every use) and a
  // retry starts clean. The error carries no link or provider body.
  for (const message of outbox) {
    try {
      await sendAuthEmail(message.email, message.link, message.kind);
    } catch {
      await prisma.authProof.deleteMany({ where: { tokenHash: message.tokenHash } });
      throw new Error("Authentication email delivery failed");
    }
  }
  return issued;
}
export async function hasPasswordCredential(db: Prisma.TransactionClient | typeof prisma, userId: string) {
  return Boolean(await db.authAccount.findFirst({ where: { userId, providerId: "credential", password: { not: null } }, select: { id: true } }));
}
export async function login(email: string, password: string, headers: Headers) {
  email = normalizeAuthEmail(email);
  const user = await prisma.authUser.findUnique({ where: { email } });
  const execute = () => getAuth().api.signInEmail({ headers, body: { email, password }, asResponse: true });
  return user ? withCredentialFence(user.id, (tx) => createAuth(tx, true).api.signInEmail({ headers, body: { email, password }, asResponse: true })) : execute();
}
async function proofIdentity(token: string) {
  if (!/^[A-Za-z0-9_-]{20,256}$/.test(token)) throw new AuthFailure();
  const proof = await prisma.authProof.findUnique({ where: { tokenHash: proofHash(token) } });
  if (!proof) throw new AuthFailure();
  return proof.userId;
}
export async function resetCredential(token: string, password: string, headers: Headers) {
  if (validateNewPassword(password)) throw new AuthFailure(400, "WEAK_PASSWORD");
  const id = await proofIdentity(token);
  await withCredentialFence(id, async (tx) => {
    const proof = await tx.authProof.findUnique({ where: { tokenHash: proofHash(token) } });
    const user = await tx.authUser.findUniqueOrThrow({ where: { id } });
    if (!proof || !["reset", "setup"].includes(proof.kind) || proof.expiresAt <= new Date() || proof.credentialVersion !== user.credentialVersion) throw new AuthFailure();
    // Native consume + credential creation/update + revocation all run on tx.
    await createAuth(tx, true).api.resetPassword({ headers, body: { token, newPassword: password } });
    await tx.authUser.update({ where: { id }, data: { emailVerified: true, credentialVersion: { increment: 1 } } });
    await tx.authProof.deleteMany({ where: { userId: id } });
    await tx.authSession.deleteMany({ where: { userId: id } });
    await tx.auditEvent.create({ data: { actorId: id, type: "auth.password_reset", payload: { method: proof.kind } } });
  });
}
export async function verifyMagic(token: string, headers: Headers) {
  const id = await proofIdentity(token);
  return withCredentialFence(id, async (tx) => {
    const proof = await tx.authProof.findUnique({ where: { tokenHash: proofHash(token) } });
    const user = await tx.authUser.findUniqueOrThrow({ where: { id } });
    if (!proof || proof.kind !== "magic" || proof.expiresAt <= new Date() || proof.credentialVersion !== user.credentialVersion) throw new AuthFailure();
    const destination = getSecuritySensitivePublicOrigin() + "/dashboard";
    const response = await createAuth(tx, true).api.magicLinkVerify({ headers, query: { token, callbackURL: destination }, asResponse: true });
    if (response.headers.get("location") !== destination || !response.headers.has("set-cookie")) throw new AuthFailure();
    await tx.authProof.delete({ where: { tokenHash: proofHash(token) } });
    return response;
  });
}
export async function changeCredential(currentPassword: string, newPassword: string, headers: Headers) {
  if (!currentPassword || currentPassword === newPassword || validateNewPassword(newPassword)) throw new AuthFailure(400, "INVALID_PASSWORD_CHANGE");
  const initial = await sessionFromHeaders(headers);
  if (!initial) throw new AuthFailure(401, "UNAUTHORIZED");
  await withCredentialFence(initial.user.id, async (tx) => {
    // Re-read the original session and reverify password UNDER the same fence.
    const current = await createAuth(tx, true).api.getSession({ headers, query: { disableCookieCache: true } });
    if (!current || current.session.id !== initial.session.id || !current.user.emailVerified || Date.now() >= new Date(current.session.createdAt).getTime() + SESSION_SECONDS * 1000) throw new AuthFailure(401, "UNAUTHORIZED");
    await createAuth(tx, true).api.changePassword({ headers, body: { currentPassword, newPassword, revokeOtherSessions: true } }).catch((error: unknown) => {
      // Caller is already authenticated; a specific code leaks no account existence.
      if (isAPIError(error) && error.body?.code === "INVALID_PASSWORD") throw new AuthFailure(400, "CURRENT_PASSWORD_INVALID");
      throw error;
    });
    // Logout-after-change: discard the rotated cookie/token, revoke it too.
    await tx.authSession.deleteMany({ where: { userId: current.user.id } });
    await tx.authProof.deleteMany({ where: { userId: current.user.id } });
    await tx.authUser.update({ where: { id: current.user.id }, data: { credentialVersion: { increment: 1 } } });
    await tx.auditEvent.create({ data: { actorId: current.user.id, type: "auth.password_changed", payload: { method: "settings" } } });
  });
}

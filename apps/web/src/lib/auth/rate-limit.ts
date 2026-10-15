import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
const key = (s: string) => createHash("sha256").update(s).digest("hex");
// Atomic shared PostgreSQL buckets; no tokens/emails/addresses stored in clear.
// Reverse proxy must strip untrusted forwarding headers before inserting its own.
export async function consumeAuthLimit(scope: string, address: string, identity: string) {
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 15 * 60000);
    await tx.authRateLimit.deleteMany({ where: { windowStart: { lt: new Date(now.getTime() - 3600000) } } });
    let allowed = true;
    for (const [bucket, max] of [[key(scope + ":address:" + address), 20], [key(scope + ":identity:" + identity), 5]] as const) {
      const rows = await tx.$queryRaw<Array<{ hits: number }>>`
        INSERT INTO "AuthRateLimit" ("key", "hits", "windowStart") VALUES (${bucket}, 1, ${now})
        ON CONFLICT ("key") DO UPDATE SET
          "hits" = CASE WHEN "AuthRateLimit"."windowStart" < ${cutoff} THEN 1 ELSE LEAST("AuthRateLimit"."hits" + 1, 100000) END,
          "windowStart" = CASE WHEN "AuthRateLimit"."windowStart" < ${cutoff} THEN ${now} ELSE "AuthRateLimit"."windowStart" END
        RETURNING "hits"`;
      if (rows[0].hits > max) allowed = false;
    }
    return allowed;
  });
}

import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { consumeConceptEntitlement } from "./concept-entitlement";
import { findConceptUploadRequest, UploadReplayMismatch } from "./concept-upload-request";

const enabled = process.env.RUN_PG_INTEGRATION === "1";
const url = process.env.PG_INTEGRATION_URL;
if (enabled) {
  const parsed = new URL(url || "http://invalid");
  if (parsed.hostname !== "127.0.0.1" || parsed.pathname !== "/lf_exit_test" || parsed.username !== "lf_runtime" || !parsed.password) throw new Error("Integration requires the owned disposable PostgreSQL runner target");
}

describe.skipIf(!enabled)("real isolated PostgreSQL portable core", () => {
  const prisma = enabled ? new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: url, max: 16 })) }) : null!;
  const profileId = randomUUID();
  const clientId = randomUUID();
  const projectId = randomUUID();
  beforeAll(async () => {
    await prisma.profile.create({ data: { id: profileId, email: "verified-fixture@example.invalid" } });
    await prisma.client.create({ data: { id: clientId, name: "Isolated test", slug: randomUUID() } });
    await prisma.project.create({ data: { id: projectId, clientId, status: "awaiting_concepts", packageCode: "test" } });
    await prisma.projectEntitlement.create({ data: { projectId, key: "concepts", limitInt: 1 } });
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it("runtime is non-owner, non-superuser, no role/database creation or RLS bypass", async () => {
    const [role] = await prisma.$queryRaw<Array<{ rolsuper: boolean; rolcreatedb: boolean; rolcreaterole: boolean; rolbypassrls: boolean }>>`SELECT rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    expect(Object.values(role)).toEqual([false, false, false, false]);
    const [privileges] = await prisma.$queryRaw<Array<{ create_schema: boolean; create_db_objects: boolean; owns: boolean }>>`SELECT has_schema_privilege(current_user, 'public', 'CREATE') AS create_schema, has_database_privilege(current_user, current_database(), 'CREATE') AS create_db_objects, EXISTS(SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tableowner=current_user) AS owns`;
    expect(privileges).toEqual({ create_schema: false, create_db_objects: false, owns: false });
    await expect(prisma.$executeRawUnsafe('CREATE TABLE public.forbidden (id int)')).rejects.toThrow();
    await expect(prisma.$executeRawUnsafe('CREATE ROLE forbidden')).rejects.toThrow();
    await expect(prisma.$queryRawUnsafe('SELECT * FROM "_prisma_migrations"')).rejects.toThrow();
  });
  it("portable tables do not pretend RLS protects app tenants and identity columns remain UUID", async () => {
    const rows = await prisma.$queryRaw<Array<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>>`SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class JOIN pg_namespace n ON n.oid=relnamespace WHERE n.nspname='public' AND relkind='r'`;
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.every((r) => !r.relrowsecurity && !r.relforcerowsecurity)).toBe(true);
    const [column] = await prisma.$queryRaw<Array<{ udt_name: string }>>`SELECT udt_name FROM information_schema.columns WHERE table_schema='public' AND table_name='Profile' AND column_name='id'`;
    expect(column.udt_name).toBe("uuid");
  });
  it("only one concurrent final entitlement claim commits", async () => {
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => prisma.$transaction((tx) => consumeConceptEntitlement(tx, projectId))));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(11);
    expect((await prisma.projectEntitlement.findUniqueOrThrow({ where: { projectId_key: { projectId, key: "concepts" } } })).consumedInt).toBe(1);
  });
  it("advisory-locked durable request receipts converge after concurrent response-loss retries", async () => {
    const requestKey = randomUUID();
    const digest = "a".repeat(64);
    const publication = { concept: { id: randomUUID(), number: 1, status: "published", notes: null }, projectStatus: "awaiting_feedback" };
    const execute = () => prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${projectId + ":" + requestKey}, 0))`;
      const found = await findConceptUploadRequest(tx, projectId, requestKey, digest);
      if (found) return found;
      await tx.auditEvent.create({ data: { projectId, actorId: profileId, type: "concept_upload_request", payload: { requestKey, digest, result: publication } } });
      return publication;
    }, { maxWait: 5000, timeout: 10000 });
    const results = await Promise.all(Array.from({ length: 8 }, execute));
    for (const result of results) expect(result).toEqual(publication);
    expect(await prisma.auditEvent.count({ where: { projectId, type: "concept_upload_request" } })).toBe(1);
    // A caller can lose the successful response after the actual COMMIT and
    // recover using the same production receipt reader on a new connection.
    expect(await findConceptUploadRequest(prisma, projectId, requestKey, digest)).toEqual(publication);
    await expect(findConceptUploadRequest(prisma, projectId, requestKey, "b".repeat(64))).rejects.toBeInstanceOf(UploadReplayMismatch);
  });
  it("rollback does not leave a committed receipt or consume an entitlement", async () => {
    await prisma.projectEntitlement.update({ where: { projectId_key: { projectId, key: "concepts" } }, data: { consumedInt: 0 } });
    const requestKey = randomUUID();
    await expect(prisma.$transaction(async (tx) => {
      await consumeConceptEntitlement(tx, projectId);
      await tx.auditEvent.create({ data: { projectId, type: "concept_upload_request", payload: { requestKey, digest: "rollback", result: { ok: true } } } });
      throw new Error("abort before commit");
    })).rejects.toThrow("abort before commit");
    expect(await findConceptUploadRequest(prisma, projectId, requestKey, "rollback")).toBeNull();
    expect((await prisma.projectEntitlement.findUniqueOrThrow({ where: { projectId_key: { projectId, key: "concepts" } } })).consumedInt).toBe(0);
  });
  it("paid order session deduplication remains a real unique database boundary", async () => {
    const session = "cs_test_" + randomUUID();
    const attempt = () => prisma.projectOrder.create({ data: { projectId, clientId, status: "paid", currency: "gbp", totalCents: 100, stripeCheckoutSessionId: session } });
    const results = await Promise.allSettled([attempt(), attempt()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(await prisma.projectOrder.count({ where: { stripeCheckoutSessionId: session } })).toBe(1);
  });
});

#!/usr/bin/env node
// Parity seed (story 0.4, O-09 seam d). Resets the disposable parity database and loads one
// scenario from tests/parity/fixtures/scenarios/<name>.json. Test tooling only: guarded to the
// lf_parity database, refuses production, never reads .env files.
//
// Usage: PARITY_MODE=1 PARITY_DATABASE_URL=postgresql://<migrate role>@127.0.0.1:<port>/lf_parity \
//        node scripts/parity-seed.mjs <scenario>
// Storage: concept images and final ZIPs are uploaded when R2_ENDPOINT is set (SeaweedFS), using
// R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_CONCEPTS_BUCKET, R2_FINAL_DELIVERABLES_BUCKET.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { hashPassword } from "better-auth/crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { assertParityMarker, assertParityTarget } from "./parity-seed-guard.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const scenarioDir = join(here, "../../../tests/parity/fixtures/scenarios");
const DAY = 86_400_000;

// Smallest valid PNG (1x1) and a one-file stored ZIP: they pass the app's validators when read back.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
function storedZip(name, content) {
  const data = Buffer.from(content);
  const nameBuf = Buffer.from(name);
  const crc = crc32(data);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4);
  local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
  central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBuf.length, 28);
  const localPart = Buffer.concat([local, nameBuf, data]);
  const centralPart = Buffer.concat([central, nameBuf]);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(centralPart.length, 12); end.writeUInt32LE(localPart.length, 16);
  return Buffer.concat([localPart, centralPart, end]);
}
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (const b of buf) { c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Deterministic UUID shared with the Laravel seeder: sha256("<scenario>:<kind>:<key>") shaped as v4. */
export function scenarioId(scenario, kind, key) {
  const h = createHash("sha256").update(`${scenario}:${kind}:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const APP_TABLES = ["AuthRateLimit", "AuthAdminBootstrap", "AuthProof", "AuthVerification", "AuthSession", "AuthAccount", "ProjectReadState",
  "AuditEvent", "ConceptComment", "RevisionRequest", "Message", "MessageThread", "FileAsset", "Concept", "ProjectEntitlement",
  "ProjectOrder", "ProjectBriefDraft", "ProjectBrief", "Project", "ClientMembership", "Client", "Profile", "AuthUser", "StripeEvent"];

async function main() {
  const name = process.argv[2];
  if (!name || !/^[a-z0-9-]+$/.test(name)) throw new Error("Usage: node scripts/parity-seed.mjs <scenario>");
  const url = assertParityTarget();
  const scenario = JSON.parse(readFileSync(join(scenarioDir, `${name}.json`), "utf8"));
  const id = (kind, key) => scenarioId(name, kind, key);
  const s3 = process.env.R2_ENDPOINT ? new S3Client({
    region: "auto", endpoint: process.env.R2_ENDPOINT, forcePathStyle: true,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "", secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "" },
  }) : null;
  const uploads = [];

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await assertParityMarker(client);
    await client.query("BEGIN");
    await client.query(`TRUNCATE ${APP_TABLES.map((t) => `"${t}"`).join(", ")} CASCADE`);
    const now = Date.now();
    const users = new Map();
    for (const u of scenario.users) {
      const userId = id("user", u.key);
      users.set(u.key, userId);
      const fullName = `${u.firstName} ${u.lastName}`;
      await client.query(`INSERT INTO "AuthUser" (id, name, email, "emailVerified", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,now(),now())`, [userId, fullName, u.email, u.emailVerified]);
      await client.query(`INSERT INTO "Profile" (id, email, "fullName", "firstName", "lastName", "isAdmin", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,now(),now())`,
        [userId, u.email, fullName, u.firstName, u.lastName, u.admin]);
      if (u.password) {
        await client.query(`INSERT INTO "AuthAccount" (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt") VALUES ($1,$2,'credential',$3,$4,now(),now())`,
          [id("account", u.key), userId, userId, await hashPassword(u.password)]);
      }
      if (u.admin) await client.query(`INSERT INTO "AuthAdminBootstrap" (id, "userId") VALUES (1, $1) ON CONFLICT DO NOTHING`, [userId]);
    }
    const adminId = scenario.users.find((u) => u.admin) ? users.get(scenario.users.find((u) => u.admin).key) : null;

    for (const p of scenario.projects) {
      const projectId = id("project", p.key), clientId = id("client", p.key);
      const created = new Date(now - (p.createdDaysAgo ?? 10) * DAY);
      let tick = 0;
      const at = () => new Date(created.getTime() + ++tick * 60_000);
      const owner = users.get(p.client.members[0]);
      await client.query(`INSERT INTO "Client" (id, name, slug, "billingEmail", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$5)`,
        [clientId, p.client.name, `${p.client.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${p.key}`, p.client.billingEmail, created]);
      for (const member of p.client.members) {
        await client.query(`INSERT INTO "ClientMembership" (id, "clientId", "userId", role, "createdAt") VALUES ($1,$2,$3,'owner',$4)`, [id("membership", `${p.key}:${member}`), clientId, users.get(member), created]);
      }
      await client.query(`INSERT INTO "Project" (id, "clientId", status, "packageCode", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$5)`, [projectId, clientId, p.status, p.package, created]);
      await client.query(`INSERT INTO "ProjectOrder" (id, "projectId", "clientId", status, currency, "totalCents", "stripeCheckoutSessionId", "stripePaymentIntentId", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,'gbp',$5,$6,$7,$8,$8)`,
        [id("order", p.key), projectId, clientId, p.order.status, p.order.totalCents, p.order.sessionId, p.order.paymentIntentId, created]);
      for (const [key, [limit, consumed, reserved]] of Object.entries(p.entitlements)) {
        await client.query(`INSERT INTO "ProjectEntitlement" (id, "projectId", key, "limitInt", "consumedInt", "reservedInt", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$7)`,
          [id("entitlement", `${p.key}:${key}`), projectId, key, limit, consumed, reserved, created]);
      }
      let previous = null;
      for (const state of p.stateHistory ?? []) {
        const when = at();
        const payload = { previousStatus: previous, nextStatus: state, ...(state === "ON_HOLD" ? { reason: p.holdReason ?? "Parity hold", source: "constrained_admin_exception" } : {}) };
        await client.query(`INSERT INTO "AuditEvent" (id, "projectId", "actorId", type, payload, "createdAt") VALUES ($1,$2,$3,'state_changed',$4,$5)`,
          [id("audit", `${p.key}:state:${state}:${tick}`), projectId, previous === null ? null : adminId, JSON.stringify(payload), when]);
        previous = state;
      }
      if (p.brief) await client.query(`INSERT INTO "ProjectBrief" (id, "projectId", version, answers, "createdBy", "createdAt") VALUES ($1,$2,1,$3,$4,$5)`, [id("brief", p.key), projectId, JSON.stringify(p.brief.answers), owner, at()]);
      if (p.briefDraft) await client.query(`INSERT INTO "ProjectBriefDraft" ("projectId", answers, "updatedBy", "updatedAt") VALUES ($1,$2,$3,$4)`, [projectId, JSON.stringify(p.briefDraft.answers), owner, at()]);
      const conceptIds = new Map();
      for (const c of p.concepts ?? []) {
        const conceptId = id("concept", `${p.key}:${c.number}`);
        conceptIds.set(c.number, conceptId);
        const when = at();
        await client.query(`INSERT INTO "Concept" (id, "projectId", number, status, notes, "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$6)`, [conceptId, projectId, c.number, c.status, c.notes ?? null, when]);
        const path = `${projectId}/${conceptId}/v1.${id("object", `${p.key}:${c.number}`)}.png`;
        await client.query(`INSERT INTO "FileAsset" (id, "projectId", kind, bucket, path, mime, size, "uploadedBy", "createdAt", "updatedAt") VALUES ($1,$2,'concept','concepts',$3,'image/png',$4,$5,$6,$6)`,
          [id("asset", `${p.key}:concept:${c.number}`), projectId, path, PNG.length, adminId, when]);
        uploads.push({ bucket: process.env.R2_CONCEPTS_BUCKET, key: path, body: PNG, type: "image/png" });
      }
      for (const [i, r] of (p.revisionRequests ?? []).entries()) {
        await client.query(`INSERT INTO "RevisionRequest" (id, "projectId", "conceptId", status, "requestedBy", body, "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$7)`,
          [id("revision", `${p.key}:${i}`), projectId, conceptIds.get(r.concept) ?? null, r.status, owner, r.body, at()]);
      }
      for (const [i, c] of (p.comments ?? []).entries()) {
        await client.query(`INSERT INTO "ConceptComment" (id, "projectId", "conceptId", "authorId", body, "createdAt") VALUES ($1,$2,$3,$4,$5,$6)`,
          [id("comment", `${p.key}:${i}`), projectId, conceptIds.get(c.concept), users.get(c.author), c.body, at()]);
      }
      if ((p.messages ?? []).length) {
        const threadId = id("thread", p.key);
        await client.query(`INSERT INTO "MessageThread" (id, "projectId", "createdAt", "updatedAt") VALUES ($1,$2,$3,$3)`, [threadId, projectId, created]);
        for (const [i, m] of p.messages.entries()) {
          await client.query(`INSERT INTO "Message" (id, "threadId", "projectId", "senderId", kind, body, "createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [id("message", `${p.key}:${i}`), threadId, projectId, users.get(m.sender), m.kind, m.body, at()]);
        }
      }
      if (p.finalZip) {
        const path = `${projectId}/finals/${id("object", `${p.key}:final`)}.zip`;
        const zip = storedZip("logo.svg", "<svg xmlns='http://www.w3.org/2000/svg'/>");
        await client.query(`INSERT INTO "FileAsset" (id, "projectId", kind, bucket, path, mime, size, "uploadedBy", "createdAt", "updatedAt") VALUES ($1,$2,'final_zip','final-deliverables',$3,'application/zip',$4,$5,$6,$6)`,
          [id("asset", `${p.key}:final`), projectId, path, zip.length, adminId, at()]);
        uploads.push({ bucket: process.env.R2_FINAL_DELIVERABLES_BUCKET, key: path, body: zip, type: "application/zip" });
      }
      // Version: the latest seeded event, so optimistic guards see a consistent updatedAt.
      await client.query(`UPDATE "Project" SET "updatedAt" = $2 WHERE id = $1`, [projectId, new Date(created.getTime() + tick * 60_000)]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
  if (s3) for (const u of uploads) await s3.send(new PutObjectCommand({ Bucket: u.bucket, Key: u.key, Body: u.body, ContentType: u.type }));
  console.log(`parity seed: loaded "${name}" (${scenario.users.length} users, ${scenario.projects.length} projects, ${s3 ? uploads.length : 0} objects)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exit(1); });
}

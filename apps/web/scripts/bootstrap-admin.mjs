// MANUAL ONLY. No env-file auto-loading, tokens/passwords in arguments, API, or
// automatic deploy hook. prepare != grant; mailbox verification happens by email.
import { randomUUID } from "node:crypto";
import pg from "pg";
import { validateDatabaseTargets } from "../src/lib/database-target.ts";
const arg = (flag) => process.argv[process.argv.indexOf(flag) + 1];
const targets = validateDatabaseTargets(process.env);
const prepare = process.argv.includes("--prepare");
const email = (arg("--email") || "").trim().toLowerCase();
if (!email.includes("@") || (!prepare && (arg("--ack") !== "ONE_TIME_ADMIN_BOOTSTRAP" || !/^[0-9a-f-]{36}$/.test(arg("--confirm-user") || "")))) throw new Error("Use --prepare --email EMAIL, or --email EMAIL --confirm-user UUID --ack ONE_TIME_ADMIN_BOOTSTRAP");
const client = new pg.Client({ connectionString: targets.migration.url });
try {
  await client.connect();
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('operator-admin-bootstrap',0))");
  const role = await client.query(`SELECT current_user = pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid='public."Profile"'::regclass`);
  if (!role.rows[0]?.owner) throw new Error("Migration table owner required");
  const spent = await client.query('SELECT 1 FROM "AuthAdminBootstrap"');
  if (spent.rowCount) throw new Error("One-time bootstrap already consumed");
  if (prepare) {
    const id = randomUUID();
    const user = await client.query('INSERT INTO "AuthUser" (id,email,name,"emailVerified","createdAt","updatedAt") VALUES ($1,$2,$2,false,now(),now()) ON CONFLICT (email) DO UPDATE SET email=EXCLUDED.email RETURNING id', [id, email]);
    await client.query('INSERT INTO "Profile" (id,email,"createdAt","updatedAt") VALUES ($1,$2,now(),now()) ON CONFLICT (id) DO NOTHING', [user.rows[0].id, email]);
    console.log(`Unprivileged identity: ${user.rows[0].id}. Verify mailbox through the app recovery email before the separate grant command.`);
  } else {
    const user = await client.query('SELECT id FROM "AuthUser" WHERE id=$1 AND email=$2 AND "emailVerified"=true FOR UPDATE', [arg("--confirm-user"), email]);
    if (!user.rowCount) throw new Error("Existing verified mailbox and exact UUID required");
    const admins = await client.query('SELECT 1 FROM "Profile" WHERE "isAdmin"=true');
    if (admins.rowCount) throw new Error("Admin already exists; bootstrap refused");
    const changed = await client.query('UPDATE "Profile" SET "isAdmin"=true,"updatedAt"=now() WHERE id=$1 RETURNING id', [user.rows[0].id]);
    if (changed.rowCount !== 1) throw new Error("Matching profile required");
    await client.query('INSERT INTO "AuthAdminBootstrap" (id,"userId") VALUES (1,$1)', [user.rows[0].id]);
    await client.query('INSERT INTO "AuditEvent" (id,"actorId",type,payload,"createdAt") VALUES ($1,$2,$3,$4,now())', [randomUUID(), user.rows[0].id, "auth.operator_admin_bootstrap", JSON.stringify({ method: "verified-one-time-operator" })]);
    console.log("One-time verified operator bootstrap committed.");
  }
  await client.query("COMMIT");
} catch {
  await client.query("ROLLBACK").catch(() => {});
  console.error("Bootstrap refused or failed. Review target, owner role, verified mailbox/UUID and one-time state; no provider diagnostics exposed.");
  process.exitCode = 1;
} finally { await client.end(); }

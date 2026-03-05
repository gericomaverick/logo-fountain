#!/usr/bin/env node

import process from "node:process";
import dotenv from "dotenv";
import { Pool } from "pg";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local", override: true });
dotenv.config({ override: false });

const DEFAULT_CANONICAL_ADMIN_EMAIL = "hello@matdoidge.co.uk";

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}. Populate it in .env.local before running this script.`);
    process.exit(1);
  }
  return value;
}

function getCanonicalAdminEmail() {
  return (process.env.CANONICAL_ADMIN_EMAIL ?? DEFAULT_CANONICAL_ADMIN_EMAIL).trim().toLowerCase();
}

async function resetDatabase(pool, canonicalAdminEmail) {
  const client = await pool.connect();
  const tables = [
    "ProjectReadState",
    "AuditEvent",
    "ConceptComment",
    "RevisionRequest",
    "Message",
    "MessageThread",
    "FileAsset",
    "Concept",
    "ProjectBrief",
    "ProjectEntitlement",
    "ProjectOrder",
    "Project",
    "ClientMembership",
    "Client",
    "StripeEvent",
  ];

  try {
    await client.query("BEGIN");

    for (const table of tables) {
      const result = await client.query(`DELETE FROM "${table}"`);
      console.log(`Removed ${result.rowCount.toString().padStart(3, " ")} rows from ${table}`);
    }

    const canonicalResult = await client.query(
      `SELECT "id", "email" FROM "Profile" WHERE LOWER("email") = $1 LIMIT 1`,
      [canonicalAdminEmail],
    );

    if (!canonicalResult.rowCount) {
      throw new Error(
        `Canonical admin profile (${canonicalAdminEmail}) not found in Profile. Aborting reset to avoid locking out admin access.`,
      );
    }

    const canonicalProfile = canonicalResult.rows[0];

    const demotedAdmins = await client.query(
      `UPDATE "Profile" SET "isAdmin" = false WHERE "isAdmin" = true AND "id" <> $1::uuid`,
      [canonicalProfile.id],
    );

    await client.query(`UPDATE "Profile" SET "isAdmin" = true WHERE "id" = $1::uuid`, [canonicalProfile.id]);

    const profileDeleteResult = await client.query(`DELETE FROM "Profile" WHERE "id" <> $1::uuid`, [canonicalProfile.id]);

    await client.query("COMMIT");

    console.log(
      `Profiles pruned. Preserved canonical admin ${canonicalProfile.email}; demoted ${demotedAdmins.rowCount} extra admin profile(s); deleted ${profileDeleteResult.rowCount} non-canonical profile(s).`,
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function pruneSupabaseUsers(canonicalAdminEmail) {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const perPage = 100;
  let page = 1;
  let deletedCount = 0;
  let preservedCount = 0;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = data?.users ?? [];
    if (!users.length) break;

    for (const user of users) {
      const email = user.email?.toLowerCase();
      if (email && email === canonicalAdminEmail) {
        preservedCount += 1;
        continue;
      }
      if (!email) continue;

      const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);
      if (deleteError) throw deleteError;
      deletedCount += 1;
    }

    if (users.length < perPage) break;
    page += 1;
  }

  console.log(
    `Supabase auth pruned. Deleted ${deletedCount} non-canonical user(s); preserved ${preservedCount} canonical admin user(s).`,
  );
}

async function main() {
  if (!hasFlag("--force")) {
    console.error("This script will permanently delete client-facing data. Re-run with --force to proceed.");
    process.exit(1);
  }

  const databaseUrl = requireEnv("DATABASE_URL");
  const canonicalAdminEmail = getCanonicalAdminEmail();
  const adminEmailAllowlist = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  if (adminEmailAllowlist.length && !adminEmailAllowlist.includes(canonicalAdminEmail)) {
    console.warn(
      `ADMIN_EMAILS does not include canonical admin ${canonicalAdminEmail}. Consider adding it to avoid admin auth mismatch.`,
    );
  }

  console.log(`Canonical admin for reset: ${canonicalAdminEmail}`);

  const pool = new Pool({ connectionString: databaseUrl });

  console.log("Resetting Postgres tables managed by Prisma...");
  await resetDatabase(pool, canonicalAdminEmail);

  console.log("\nResetting Supabase auth users (non-canonical)...");
  await pruneSupabaseUsers(canonicalAdminEmail);

  await pool.end();
  console.log("\nDevelopment data reset complete.");
}

main().catch((err) => {
  console.error("\nReset failed:", err);
  process.exit(1);
});

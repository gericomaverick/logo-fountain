#!/usr/bin/env node

import process from "node:process";
import dotenv from "dotenv";
import { Pool } from "pg";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local", override: true });
dotenv.config({ override: false });

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

function parseAdminEmails() {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

async function resetDatabase(pool, adminEmailSet) {
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

    const adminEmails = Array.from(adminEmailSet);
    let adminProfilesQuery = `SELECT "id", "email", "isAdmin" FROM "Profile" WHERE "isAdmin" = true`;
    const adminQueryParams = [];
    if (adminEmails.length) {
      adminProfilesQuery += ` OR LOWER("email") = ANY($1::text[])`;
      adminQueryParams.push(adminEmails);
    }

    const { rows: adminProfiles } = await client.query(adminProfilesQuery, adminQueryParams);
    const adminIds = adminProfiles.map((row) => row.id);

    const deleteConditions = ['COALESCE("isAdmin", false) = false'];
    const deleteParams = [];
    if (adminEmails.length) {
      deleteParams.push(adminEmails);
      deleteConditions.push(`NOT (LOWER("email") = ANY($${deleteParams.length}::text[]))`);
    }
    if (adminIds.length) {
      deleteParams.push(adminIds);
      deleteConditions.push(`NOT ("id" = ANY($${deleteParams.length}::uuid[]))`);
    }

    const profileDeleteSql = `DELETE FROM "Profile" WHERE ${deleteConditions.join(" AND ")}`;
    const profileDeleteResult = await client.query(profileDeleteSql, deleteParams);

    await client.query("COMMIT");

    console.log(
      `Profiles pruned. Preserved ${adminIds.length} admin profile(s); deleted ${profileDeleteResult.rowCount} non-admin profile(s).`,
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function pruneSupabaseUsers(adminEmailSet) {
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
      if (email && adminEmailSet.has(email)) {
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
    `Supabase auth pruned. Deleted ${deletedCount} non-admin user(s); preserved ${preservedCount} admin user(s).`,
  );
}

async function main() {
  if (!hasFlag("--force")) {
    console.error("This script will permanently delete client-facing data. Re-run with --force to proceed.");
    process.exit(1);
  }

  const databaseUrl = requireEnv("DATABASE_URL");
  const adminEmailSet = parseAdminEmails();
  if (adminEmailSet.size === 0) {
    console.warn("ADMIN_EMAILS is empty. Only profiles with isAdmin=true will be preserved.");
  }

  const pool = new Pool({ connectionString: databaseUrl });

  console.log("Resetting Postgres tables managed by Prisma...");
  await resetDatabase(pool, adminEmailSet);

  console.log("\nResetting Supabase auth users (non-admin)...");
  await pruneSupabaseUsers(adminEmailSet);

  await pool.end();
  console.log("\nDevelopment data reset complete.");
}

main().catch((err) => {
  console.error("\nReset failed:", err);
  process.exit(1);
});

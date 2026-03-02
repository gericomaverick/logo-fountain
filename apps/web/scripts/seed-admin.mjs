#!/usr/bin/env node

import process from "node:process";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local", override: true });
dotenv.config({ override: false });

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

const email = getArg("--email");
const password = getArg("--password");

if (!email || !password) {
  console.error("Usage: node scripts/seed-admin.mjs --email <email> --password <password>");
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRole) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // Create or find user.
  let userId = null;

  const list = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (list.error) throw list.error;

  const existing = list.data.users.find((u) => (u.email || "").toLowerCase() === email.toLowerCase());
  if (existing) {
    userId = existing.id;
  } else {
    const created = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (created.error) throw created.error;
    userId = created.data.user?.id;
  }

  if (!userId) throw new Error("Failed to resolve user id");

  // Ensure profile row + admin flag.
  const upsertProfile = await supabase.from("profiles").upsert(
    { id: userId, email, is_admin: true },
    { onConflict: "id" }
  );
  if (upsertProfile.error) throw upsertProfile.error;

  console.log(`Admin user ready: ${email} (userId=${userId})`);
  console.log("You can now sign in at /login with the provided password.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

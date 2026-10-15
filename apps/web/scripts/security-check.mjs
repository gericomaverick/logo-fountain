import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const srcDir = path.join(root, "src");
const envFiles = [".env", ".env.local", ".env.example"];

const issues = [];

function parseEnv(content) {
  const values = new Map();
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    values.set(key, value);
  }
  return values;
}

for (const rel of envFiles) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) continue;

  const env = parseEnv(fs.readFileSync(full, "utf8"));
  for (const key of env.keys()) {
    if (key.startsWith("NEXT_PUBLIC_") && key.toUpperCase().includes("SERVICE_ROLE")) {
      issues.push(`${rel}: forbidden public env var name (${key})`);
    }
  }

  for (const privateKey of ["BETTER_AUTH_SECRET", "DATABASE_URL", "DIRECT_URL", "R2_SECRET_ACCESS_KEY", "POSTMARK_SERVER_TOKEN", "STRIPE_SECRET_KEY"]) {
    const secret = env.get(privateKey);
    for (const [key, value] of env) {
      if (secret && key.startsWith("NEXT_PUBLIC_") && value === secret) issues.push(`${rel}: public ${key} duplicates private ${privateKey}`);
    }
  }
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!/\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) continue;

    const file = fs.readFileSync(full, "utf8");
    if (file.includes('"use client"') || file.includes("'use client'")) {
      if (/from ["\'](?:@\/lib\/(?:auth\/(?:server|service|fence|mail)|prisma)|better-auth(?:\/|["\']))/.test(file)) {
        issues.push(`${path.relative(root, full)}: client file must not import server auth/database implementation`);
      }
    }

    if (/process\.env\.NEXT_PUBLIC_(?:BETTER_AUTH_SECRET|DATABASE_URL|DIRECT_URL|R2_SECRET_ACCESS_KEY|POSTMARK_SERVER_TOKEN|STRIPE_SECRET_KEY)/.test(file)) {
      issues.push(`${path.relative(root, full)}: private credential referenced through public environment`);
    }
  }
}

walk(srcDir);

if (issues.length > 0) {
  console.error("Security check failed:\n");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Security check passed: no public private-credential leakage patterns detected.");
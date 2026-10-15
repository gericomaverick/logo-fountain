// Prisma 7 uses prisma.config.ts for connection URLs.
// We intentionally load `.env.local` for developer machines.
import dotenv from "dotenv";
import { defineConfig } from "prisma/config";
import { validateDatabaseTargets } from "./src/lib/database-target";

// Prefer `.env.local` values even if `.env` exists.
dotenv.config({ path: ".env.local", override: true, quiet: true });
// Fallback to `.env` for any missing keys.
dotenv.config({ override: false, quiet: true });

// Generation/schema-only diff need no database connection. Every migrate/db
// command must pass preflight BEFORE Prisma can open a migration connection.
const isDatabaseCommand = process.argv.some((arg) => arg === "migrate" || arg === "db" || arg === "studio");
if (isDatabaseCommand && process.argv.some((arg) => /^(--url|--from-url|--to-url|--shadow-database-url)(=|$)/.test(arg))) {
  throw new Error("Database URL CLI overrides are forbidden; configure validated DATABASE_URL and DIRECT_URL");
}
const migrationUrl = isDatabaseCommand
  ? validateDatabaseTargets({ DATABASE_URL: process.env.DATABASE_URL, DIRECT_URL: process.env.DIRECT_URL }).migration.url
  : process.env.DIRECT_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // No runtime fallback; database commands above require separate roles.
    url: migrationUrl,
  },
});

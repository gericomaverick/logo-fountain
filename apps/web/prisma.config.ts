// Prisma 7 uses prisma.config.ts for connection URLs.
// We intentionally load `.env.local` for developer machines.
import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

// Prefer `.env.local` values even if `.env` exists.
dotenv.config({ path: ".env.local", override: true });
// Fallback to `.env` for any missing keys.
dotenv.config({ override: false });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});

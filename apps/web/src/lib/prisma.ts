import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { PrismaClient } from "../generated/prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function makePrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Missing env var: DATABASE_URL");

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = globalThis.__prisma ?? makePrismaClient();

if (process.env.NODE_ENV !== "production") globalThis.__prisma = prisma;

import { domainToASCII } from "node:url";

type Target = { host: string; port: string; database: string; user: string; url: string };
const OVERRIDE_KEYS = new Set(["host", "hostaddr", "port", "user", "password", "dbname", "database", "service", "servicefile", "options", "sslpassword"]);

/** Validate without connecting and without including credentials in errors. */
export function validatePostgresTarget(value: string | undefined, label: string): Target {
  const fail = (): never => { throw new Error(`${label}: expected an explicit non-Supabase PostgreSQL target with user, password, host and database; connection routing overrides are forbidden`); };
  if (!value?.trim()) return fail();
  try {
    const url = new URL(value);
    if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") return fail();
    const decodedHost = decodeURIComponent(url.hostname).toLowerCase().replace(/\.$/, "");
    const host = decodedHost.startsWith("[") ? decodedHost : domainToASCII(decodedHost);
    if (!host || /supabase/.test(host) || /[\s/,\\%]/.test(host) || url.hash) return fail();
    const user = decodeURIComponent(url.username);
    const database = decodeURIComponent(url.pathname.slice(1));
    if (!user || !url.password || !/^[A-Za-z0-9_][A-Za-z0-9_-]*$/.test(database)) return fail();
    const schemas = url.searchParams.getAll("schema");
    if (schemas.length > 1 || schemas.some((schema) => schema !== "public")) return fail();
    for (const key of url.searchParams.keys()) if (OVERRIDE_KEYS.has(key.toLowerCase())) return fail();
    return { host, port: url.port || "5432", database, user, url: value };
  } catch { return fail(); }
}

export function validateDatabaseTargets(env: { DATABASE_URL?: string; DIRECT_URL?: string }) {
  const runtime = validatePostgresTarget(env.DATABASE_URL, "DATABASE_URL");
  const migration = validatePostgresTarget(env.DIRECT_URL, "DIRECT_URL");
  if (runtime.host !== migration.host || runtime.port !== migration.port || runtime.database !== migration.database) {
    throw new Error("DATABASE_URL and DIRECT_URL must target the same explicit host, port and database; hostname aliases are not inferred");
  }
  if (runtime.user === migration.user) throw new Error("DATABASE_URL and DIRECT_URL require distinct runtime and migration roles");
  return { runtime, migration };
}

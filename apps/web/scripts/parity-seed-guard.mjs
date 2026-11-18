// Fail-closed guard for the parity seed (story 0.4, O-09). The seed truncates every table, so it may
// only ever touch the disposable parity database created by tests/parity/infra (docker-compose.test.yml).
const ALLOWED_HOSTS = new Set(["127.0.0.1", "localhost", "postgres", "::1", "[::1]"]);

export function assertParityTarget(env = process.env) {
  if (env.PARITY_MODE !== "1") throw new Error("parity seed refused: PARITY_MODE=1 is required");
  if (env.NODE_ENV === "production") throw new Error("parity seed refused: NODE_ENV=production");
  const raw = env.PARITY_DATABASE_URL;
  if (!raw) throw new Error("parity seed refused: PARITY_DATABASE_URL is required (the owner/migrate role URL)");
  let url;
  try { url = new URL(raw); } catch { throw new Error("parity seed refused: PARITY_DATABASE_URL is not a valid URL"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("parity seed refused: not a PostgreSQL URL");
  if (!ALLOWED_HOSTS.has(url.hostname)) throw new Error(`parity seed refused: host ${url.hostname} is not a local parity host`);
  if (decodeURIComponent(url.pathname.slice(1)) !== "lf_parity") throw new Error("parity seed refused: database must be lf_parity");
  return raw;
}

/** Must be called with a connected pg client before any write. */
export async function assertParityMarker(client) {
  const { rows } = await client.query("SELECT to_regclass('parity.parity_marker') IS NOT NULL AS present");
  if (!rows[0]?.present) throw new Error("parity seed refused: table parity.parity_marker is missing (not the parity database)");
}

import { describe, expect, it } from "vitest";

// @ts-expect-error -- plain ESM script without type declarations
import { assertParityMarker, assertParityTarget } from "../../../scripts/parity-seed-guard.mjs";

const ok = { PARITY_MODE: "1", NODE_ENV: "test", PARITY_DATABASE_URL: "postgresql://lf_migrate:x@127.0.0.1:55432/lf_parity" };

describe("parity seed guard (story 0.4)", () => {
  it("accepts the local parity database", () => {
    expect(assertParityTarget(ok)).toBe(ok.PARITY_DATABASE_URL);
    expect(assertParityTarget({ ...ok, PARITY_DATABASE_URL: "postgres://u:p@postgres:5432/lf_parity" })).toBeTruthy();
  });

  it.each([
    ["no PARITY_MODE", { ...ok, PARITY_MODE: undefined }, /PARITY_MODE=1/],
    ["production", { ...ok, NODE_ENV: "production" }, /production/],
    ["no URL", { ...ok, PARITY_DATABASE_URL: undefined }, /required/],
    ["bad URL", { ...ok, PARITY_DATABASE_URL: "not a url" }, /valid URL/],
    ["not postgres", { ...ok, PARITY_DATABASE_URL: "mysql://u:p@127.0.0.1/lf_parity" }, /PostgreSQL/],
    ["remote host", { ...ok, PARITY_DATABASE_URL: "postgresql://u:p@db.example.com/lf_parity" }, /not a local parity host/],
    ["wrong database", { ...ok, PARITY_DATABASE_URL: "postgresql://u:p@127.0.0.1/lf_local_dev" }, /lf_parity/],
  ])("refuses: %s", (_label, env, message) => {
    expect(() => assertParityTarget(env)).toThrow(message);
  });

  it("refuses a database without the parity_marker table", async () => {
    const client = { query: async () => ({ rows: [{ present: false }] }) };
    await expect(assertParityMarker(client)).rejects.toThrow(/parity_marker/);
    await expect(assertParityMarker({ query: async () => ({ rows: [{ present: true }] }) })).resolves.toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import { validateDatabaseTargets, validatePostgresTarget } from "./database-target";
const runtime = "postgresql://lf_runtime:runtime-secret@127.0.0.1:5432/lf_app?schema=public";
const migration = "postgresql://lf_migration:migration-secret@127.0.0.1/lf_app";
describe("portable PostgreSQL preflight", () => {
  it("accepts explicit same-target separate-role URLs without connecting", () => {
    const result = validateDatabaseTargets({ DATABASE_URL: runtime, DIRECT_URL: migration });
    expect(result.runtime.database).toBe("lf_app");
    expect(result.migration.user).toBe("lf_migration");
  });
  it.each([undefined, "", "https://user:pw@localhost/db", "postgresql:///db", "postgresql://user:pw@localhost", "postgresql://user@localhost/db", "postgresql://user:pw@localhost/db#fragment", "postgresql://user:pw@localhost/a/b", "postgresql://user:pw@localhost/db?schema=auth", "postgresql://user:pw@localhost/db?schema=public&schema=auth", "postgresql://user:pw@localhost/db?host=live", "postgresql://user:pw@localhost/db?hostaddr=1.2.3.4", "postgresql://user:pw@localhost/db?options=-c%20role=owner", "postgresql://user:pw@localhost/db?user=owner", "postgresql://user:pw@localhost/db?service=live", "postgresql://user:pw@db.project.supabase.co/db", "postgresql://user:pw@aws-0-eu.pooler.supabase.com/db", "postgresql://user:pw@DB.SUPABASE.NET./db", "postgresql://user:pw@db.%73upabase.co/db"]) ("rejects missing, ambiguous, overridden or Supabase target %s", (value) => {
    expect(() => validatePostgresTarget(value, "DATABASE_URL")).toThrow("DATABASE_URL:");
  });
  it.each(["postgresql://lf_migration:secret@localhost/lf_app", "postgresql://lf_migration:secret@127.0.0.1:5433/lf_app", "postgresql://lf_migration:secret@127.0.0.1/other", "postgresql://lf_runtime:secret@127.0.0.1/lf_app", "postgresql://lf_migration:secret@old.supabase.co/lf_app"]) ("rejects migration mismatch/role/old provider %s", (value) => {
    expect(() => validateDatabaseTargets({ DATABASE_URL: runtime, DIRECT_URL: value })).toThrow();
  });
  it("does not fall back to runtime credentials or leak secrets", () => {
    for (const env of [{ DATABASE_URL: runtime }, { DIRECT_URL: migration }, { DATABASE_URL: runtime, DIRECT_URL: "postgresql://lf_migration:super-secret@old.supabase.co/db" }]) {
      try { validateDatabaseTargets(env); throw new Error("unexpected success"); } catch (error) {
        expect(String(error)).not.toMatch(/runtime-secret|migration-secret|super-secret/);
      }
    }
  });
  it("accepts normalized case/default port but does not infer hostname aliases", () => {
    expect(validateDatabaseTargets({ DATABASE_URL: runtime.replace("127.0.0.1:5432", "DB.INTERNAL."), DIRECT_URL: migration.replace("127.0.0.1", "db.internal") }).runtime.host).toBe("db.internal");
  });
});

// Journey 17 (02-test-strategy.md §4): the health page with object storage up, then with the SeaweedFS container
// stopped for a moment, then up again (D-18). Only the storage checks change; the database check keeps passing.
// The storage outage is real, so the file holds the exclusive DB lease (no other DB-backed test runs meanwhile).
import { execFileSync } from "node:child_process";
import { expect, test } from "../fixtures";
import { PARITY_PASSWORD } from "../adapters/api";
import { seed } from "../adapters/seed";
import { adminPagesFor, pagesFor, type AdminHealthReport } from "../pages";

test.use({ db: "exclusive" });
test.describe.configure({ timeout: 180_000 });

// The SeaweedFS container is the one publishing the S3 port the app talks to (infra/docker-compose.test.yml).
const s3Port = process.env.R2_ENDPOINT ? new URL(process.env.R2_ENDPOINT).port : process.env.PARITY_S3_PORT || "58333";
const docker = (...args: string[]) => execFileSync("docker", args, { encoding: "utf8" }).trim();

async function waitHealthy(container: string) {
  for (let i = 0; i < 120; i++) {
    if (docker("inspect", "--format", "{{.State.Health.Status}}", container) === "healthy") return;
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error(`container ${container} did not become healthy again`);
}

const area = (report: AdminHealthReport, name: string) => report.checks.filter((c) => c.area === name).map((c) => c.passed);

test("D-18 J17 the health page shows storage healthy, then failing while SeaweedFS is down, then healthy again @admin @ui @ops @storage", async ({ page }) => {
  seed("admin-only");
  const container = docker("ps", "--filter", `publish=${s3Port}`, "--format", "{{.ID}}");
  expect(container, `no running container publishes the S3 port ${s3Port}`).toMatch(/^[0-9a-f]+$/);
  const { auth } = await pagesFor(page);
  await auth.signIn("admin@parity.test", PARITY_PASSWORD);
  const admin = await adminPagesFor(page);

  const up = await admin.health();
  expect(area(up, "storage")).toEqual([true, true]); // one check per bucket (concepts, final deliverables)
  expect(area(up, "database")).toEqual([true]);

  docker("stop", "--time", "2", container);
  try {
    const down = await admin.health();
    expect(area(down, "storage")).toEqual([false, false]);
    expect(area(down, "database")).toEqual([true]);
    expect(down.ok).toBe(false);
  } finally {
    docker("start", container);
    await waitHealthy(container);
  }
  await expect.poll(async () => area(await admin.health(), "storage"), { timeout: 30_000 }).toEqual([true, true]);
});

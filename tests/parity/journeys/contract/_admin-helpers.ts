// Shared helpers for the admin contract suites (story 0.7c). Black-box only: HTTP through
// adapters/api.ts, state through adapters/seed.ts. Never branch on the target here.
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync, crc32 } from "node:zlib";
import type { APIRequestContext, APIResponse } from "@playwright/test";
import { apiClient, baseURL } from "../../adapters/api";
import { scenarioId, seed } from "../../adapters/seed";
import { expect, test as base } from "../../fixtures";

export { expect };

export const ADMIN = "admin@parity.test";
export const CLIENT_A = "client.a@parity.test";
export const HOSTILE_ORIGIN = "https://evil.example";
/** A well-formed v4 UUID that no scenario uses. */
export const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";

// ---------------------------------------------------------------------------
// One database is shared by every worker, and seeding truncates it. Each test therefore holds a
// cross-process lock (a directory created atomically) for its whole run, so tests in different
// files never interleave. Stale locks (dead holder or >5 min old) are taken over.
// ---------------------------------------------------------------------------
const LOCK_DIR = join(tmpdir(), `lf-parity-db-${Buffer.from(process.env.PARITY_DATABASE_URL ?? "default").toString("hex").slice(-24)}.lock`);

function holderAlive(): boolean {
  try {
    const pid = Number(readFileSync(join(LOCK_DIR, "pid"), "utf8"));
    if (Date.now() - statSync(LOCK_DIR).mtimeMs > 300_000) return false;
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM" || (error as NodeJS.ErrnoException).code === "ENOENT";
  }
}

async function acquireDbLock(): Promise<() => void> {
  for (;;) {
    try {
      mkdirSync(LOCK_DIR);
      writeFileSync(join(LOCK_DIR, "pid"), String(process.pid));
      return () => rmSync(LOCK_DIR, { recursive: true, force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (!holderAlive()) rmSync(LOCK_DIR, { recursive: true, force: true });
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

type AdminFixtures = {
  dbLock: void;
  /** Seeds a scenario and returns its deterministic IDs plus a signed-in admin client. */
  scenario: (name: string) => Promise<Seeded>;
  /** A cookie-isolated client; `signInAs` logs in through the real login endpoint. */
  client: (signInAs?: string) => Promise<APIRequestContext>;
};

export type Seeded = {
  name: string;
  admin: APIRequestContext;
  projectId: (key?: string) => string;
  conceptId: (number: number, projectKey?: string) => string;
  revisionId: (index?: number, projectKey?: string) => string;
  finalAssetId: (projectKey?: string) => string;
};

export const test = base.extend<AdminFixtures>({
  dbLock: [
    async ({}, use) => {
      const release = await acquireDbLock();
      try {
        await use();
      } finally {
        release();
      }
    },
    { auto: true, timeout: 600_000 },
  ],
  client: async ({}, use) => {
    const contexts: APIRequestContext[] = [];
    await use(async (signInAs?: string) => {
      const ctx = await apiClient(signInAs ? { signInAs } : {});
      contexts.push(ctx);
      return ctx;
    });
    await Promise.all(contexts.map((ctx) => ctx.dispose()));
  },
  scenario: async ({ client }, use) => {
    await use(async (name: string) => {
      seed(name);
      const id = (kind: string, key: string) => scenarioId(name, kind, key);
      return {
        name,
        admin: await client(ADMIN),
        projectId: (key = "p1") => id("project", key),
        conceptId: (number, key = "p1") => id("concept", `${key}:${number}`),
        revisionId: (index = 0, key = "p1") => id("revision", `${key}:${index}`),
        finalAssetId: (key = "p1") => id("asset", `${key}:final`),
      };
    });
  },
});

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

/** Asserts the standard `{error:{message, code}}` shape (X-03) and the status. */
export async function expectError(res: APIResponse, status: number, code: string): Promise<{ error: { message: string; code?: string; details?: unknown } }> {
  const body = await res.json();
  expect({ status: res.status(), code: body?.error?.code }, JSON.stringify(body)).toEqual({ status, code });
  expect(typeof body.error.message).toBe("string");
  return body;
}

/** Asserts a 2xx JSON response and returns its body. */
export async function expectOk<T = any>(res: APIResponse, status = 200): Promise<T> {
  const text = await res.text();
  expect(res.status(), text).toBe(status);
  return JSON.parse(text) as T;
}

export const api = (projectId: string, suffix = "") => `/api/admin/projects/${projectId}${suffix}`;

export async function snapshot(admin: APIRequestContext, projectId: string): Promise<any> {
  return (await expectOk(await admin.get(api(projectId)))).snapshot;
}

export async function auditEvents(admin: APIRequestContext, projectId: string, type?: string): Promise<any[]> {
  const { events } = await expectOk<{ events: any[] }>(await admin.get(api(projectId, "/audit")));
  return type ? events.filter((event) => event.type === type) : events;
}

export async function conceptsList(admin: APIRequestContext, projectId: string): Promise<any> {
  return expectOk(await admin.get(api(projectId, "/concepts")));
}

// ---------------------------------------------------------------------------
// Upload payloads (generated in-test; tiny, structurally valid)
// ---------------------------------------------------------------------------

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

/** A valid 2x2 RGB PNG; different `seed` values give different bytes. */
export function makePng(seedValue = 0): Buffer {
  const width = 2, height = 2;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  const rows: number[] = [];
  for (let y = 0; y < height; y++) {
    rows.push(0); // filter: none
    for (let x = 0; x < width; x++) rows.push((seedValue * 37 + x * 90) & 0xff, (seedValue * 11 + y * 120) & 0xff, (seedValue * 53) & 0xff);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(Buffer.from(rows))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/** A valid one-entry stored ZIP. */
export function makeZip(name = "logo.svg", content = "<svg xmlns='http://www.w3.org/2000/svg'/>"): Buffer {
  const data = Buffer.from(content);
  const nameBuf = Buffer.from(name);
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4);
  local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
  central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBuf.length, 28);
  const localPart = Buffer.concat([local, nameBuf, data]);
  const centralPart = Buffer.concat([central, nameBuf]);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(centralPart.length, 12); end.writeUInt32LE(localPart.length, 16);
  return Buffer.concat([localPart, centralPart, end]);
}

export type FilePart = { name: string; mimeType: string; buffer: Buffer };
export const pngFile = (seedValue = 0, name = "concept.png"): FilePart => ({ name, mimeType: "image/png", buffer: makePng(seedValue) });
export const zipFile = (name = "finals.zip"): FilePart => ({ name, mimeType: "application/zip", buffer: makeZip() });

/** Multipart concept upload. Pass `requestKey: null` to omit it. */
export function uploadConcept(
  ctx: APIRequestContext,
  projectId: string,
  fields: { file?: FilePart | null; requestKey?: string | null; uploadMode?: string; conceptNumber?: number; conceptId?: string; notes?: string; assetNotes?: string },
  headers?: Record<string, string>,
): Promise<APIResponse> {
  const multipart: Record<string, string | number | FilePart> = {};
  const file = fields.file === undefined ? pngFile() : fields.file;
  if (file) multipart.file = file;
  const key = fields.requestKey === undefined ? randomUUID() : fields.requestKey;
  if (key !== null) multipart.requestKey = key;
  for (const name of ["uploadMode", "conceptNumber", "conceptId", "notes", "assetNotes"] as const) {
    if (fields[name] !== undefined) multipart[name] = String(fields[name]);
  }
  return ctx.post(api(projectId, "/concepts"), { multipart, headers });
}

export function uploadFinals(ctx: APIRequestContext, projectId: string, file: FilePart | null = zipFile()): Promise<APIResponse> {
  return ctx.post(api(projectId, "/finals"), { multipart: file ? { file } : { note: "no file" } });
}

export { baseURL, randomUUID };

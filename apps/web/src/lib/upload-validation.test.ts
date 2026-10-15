import { describe, expect, it, vi } from "vitest";

import {
  MAX_CONCEPT_IMAGE_BYTES,
  MAX_FINAL_ZIP_BYTES,
  prepareConceptImage,
  prepareFinalZip,
  UploadValidationError,
} from "./upload-validation";

function part(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

function png(width = 1, height = 1): Uint8Array {
  const bytes = new Uint8Array(45);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  bytes.set([8, 6, 0, 0, 0], 24);
  // CRC bytes are intentionally arbitrary; structural validation is bounded and
  // the browser remains responsible for full pixel decoding.
  bytes.set([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0, 0, 0, 0], 33);
  return bytes;
}

function jpeg(): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xc0, 0, 11, 8, 0, 1, 0, 1, 1, 1, 0x11, 0,
    0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0,
    0x01,
    0xff, 0xd9,
  ]);
}

function webp(): Uint8Array {
  const bytes = new Uint8Array(26);
  bytes.set([0x52, 0x49, 0x46, 0x46, 18, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c, 5, 0, 0, 0, 0x2f, 0, 0, 0, 0, 0]);
  return bytes;
}

function zip(options: { compressed?: number; uncompressed?: number; name?: string } = {}): Uint8Array {
  const name = new TextEncoder().encode(options.name ?? "logo.txt");
  const compressed = options.compressed ?? 1;
  const uncompressed = options.uncompressed ?? compressed;
  const localSize = 30 + name.length + compressed;
  const centralSize = 46 + name.length;
  const bytes = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(8, 0, true);
  view.setUint32(18, compressed, true);
  view.setUint32(22, uncompressed, true);
  view.setUint16(26, name.length, true);
  bytes.set(name, 30);
  const central = localSize;
  view.setUint32(central, 0x02014b50, true);
  view.setUint16(central + 4, 20, true);
  view.setUint16(central + 6, 20, true);
  view.setUint16(central + 10, 0, true);
  view.setUint32(central + 20, compressed, true);
  view.setUint32(central + 24, uncompressed, true);
  view.setUint16(central + 28, name.length, true);
  view.setUint32(central + 42, 0, true);
  bytes.set(name, central + 46);
  const eocd = central + centralSize;
  view.setUint32(eocd, 0x06054b50, true);
  view.setUint16(eocd + 8, 1, true);
  view.setUint16(eocd + 10, 1, true);
  view.setUint32(eocd + 12, centralSize, true);
  view.setUint32(eocd + 16, central, true);
  return bytes;
}

async function rejectsCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ name: "UploadValidationError", code });
}

describe("concept image validation", () => {
  it.each([
    [png(), "logo.png", "image/png", "png"],
    [jpeg(), "logo.jpeg", "image/jpeg", "jpg"],
    [webp(), "logo.webp", "image/webp", "webp"],
  ])("accepts a structurally valid allowlisted image", async (body, name, type, extension) => {
    await expect(prepareConceptImage(new File([part(body)], name, { type }))).resolves.toMatchObject({ contentType: type, extension });
  });

  it("rejects SVG even when it declares an image MIME", async () => {
    await rejectsCode(prepareConceptImage(new File(["<svg/ >"], "logo.svg", { type: "image/svg+xml" })), "INVALID_FILE_TYPE");
  });

  it("rejects a spoofed extension/MIME pair and spoofed magic bytes", async () => {
    await rejectsCode(prepareConceptImage(new File([part(png())], "logo.jpg", { type: "image/png" })), "INVALID_FILE_TYPE");
    await rejectsCode(prepareConceptImage(new File(["not png"], "logo.png", { type: "image/png" })), "FILE_SIGNATURE_MISMATCH");
  });

  it("rejects malformed and excessive decode dimensions", async () => {
    await rejectsCode(prepareConceptImage(new File([part(png().slice(0, 33))], "logo.png", { type: "image/png" })), "MALFORMED_IMAGE");
    await rejectsCode(prepareConceptImage(new File([part(png(10_000, 10_000))], "logo.png", { type: "image/png" })), "IMAGE_DIMENSIONS_TOO_LARGE");
  });

  it("rejects oversized files before arrayBuffer", async () => {
    const file = new File(["x"], "logo.png", { type: "image/png" });
    Object.defineProperty(file, "size", { value: MAX_CONCEPT_IMAGE_BYTES + 1 });
    const read = vi.spyOn(file, "arrayBuffer");
    await rejectsCode(prepareConceptImage(file), "FILE_TOO_LARGE");
    expect(read).not.toHaveBeenCalled();
  });
});

describe("final ZIP validation", () => {
  it("accepts ZIP MIME aliases but canonicalizes stored metadata", async () => {
    await expect(prepareFinalZip(new File([part(zip())], "Final.ZIP", { type: "application/x-zip-compressed" }))).resolves.toMatchObject({
      contentType: "application/zip",
      extension: "zip",
      contentDisposition: 'attachment; filename="final-deliverables.zip"',
    });
  });

  it("rejects spoofed MIME/name, bad signatures, malformed archives, and traversal", async () => {
    await rejectsCode(prepareFinalZip(new File([part(zip())], "final.png", { type: "application/zip" })), "INVALID_FILE_TYPE");
    await rejectsCode(prepareFinalZip(new File([part(zip())], "final.zip", { type: "text/plain" })), "INVALID_FILE_TYPE");
    await rejectsCode(prepareFinalZip(new File(["PK fake"], "final.zip", { type: "application/zip" })), "FILE_SIGNATURE_MISMATCH");
    await rejectsCode(prepareFinalZip(new File([part(zip().slice(0, -1))], "final.zip", { type: "application/zip" })), "MALFORMED_ZIP");
    await rejectsCode(prepareFinalZip(new File([part(zip({ name: "../logo.svg" }))], "final.zip", { type: "application/zip" })), "MALFORMED_ZIP");
  });

  it("rejects an obvious compression bomb", async () => {
    await rejectsCode(prepareFinalZip(new File([part(zip({ compressed: 1, uncompressed: 1_000 }))], "final.zip", { type: "application/zip" })), "ZIP_LIMIT_EXCEEDED");
  });

  it("rejects oversized files before arrayBuffer", async () => {
    const file = new File(["x"], "final.zip", { type: "application/zip" });
    Object.defineProperty(file, "size", { value: MAX_FINAL_ZIP_BYTES + 1 });
    const read = vi.spyOn(file, "arrayBuffer");
    await rejectsCode(prepareFinalZip(file), "FILE_TOO_LARGE");
    expect(read).not.toHaveBeenCalled();
  });
});

// Keep the custom error exported and identifiable across route boundaries.
it("uses a typed validation error", () => {
  expect(new UploadValidationError("X", "bad")).toMatchObject({ code: "X", message: "bad" });
});

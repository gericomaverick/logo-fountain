import { validateZip, crc32 } from "./zip-validation";
const MIB = 1024 * 1024;

export const MAX_CONCEPT_IMAGE_BYTES = 10 * MIB;
export const MAX_CONCEPT_IMAGE_PIXELS = 40_000_000;
export const MAX_FINAL_ZIP_BYTES = 100 * MIB;
export const MAX_FINAL_ZIP_ENTRIES = 1_000;
export const MAX_FINAL_ZIP_UNCOMPRESSED_BYTES = 500 * MIB;
export const MAX_FINAL_ZIP_COMPRESSION_RATIO = 100;

export type PreparedUpload = {
  bytes: Uint8Array;
  extension: "png" | "jpg" | "webp" | "zip";
  contentType: "image/png" | "image/jpeg" | "image/webp" | "application/zip";
  size: number;
};

export class UploadValidationError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "UploadValidationError";
  }
}

function fail(code: string, message: string): never {
  throw new UploadValidationError(code, message);
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function requireSize(file: File, maximum: number, label: string) {
  if (file.size <= 0) fail("FILE_REQUIRED", `${label} is empty`);
  // This check must stay before arrayBuffer(): it is the application-level
  // allocation boundary (the HTTP runtime may already have parsed multipart).
  if (file.size > maximum) fail("FILE_TOO_LARGE", `${label} exceeds the ${maximum / MIB} MB limit`);
}

function readU16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function readU32LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16) | (bytes[offset + 3]! << 24)) >>> 0;
}

function readU32BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0;
}

function assertDimensions(width: number, height: number) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    fail("MALFORMED_IMAGE", "Image has invalid dimensions");
  }
  if (width * height > MAX_CONCEPT_IMAGE_PIXELS) {
    fail("IMAGE_DIMENSIONS_TOO_LARGE", `Image exceeds the ${MAX_CONCEPT_IMAGE_PIXELS.toLocaleString("en-US")}-pixel decode limit`);
  }
}

function validatePng(bytes: Uint8Array) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 33 || !signature.every((byte, index) => bytes[index] === byte)) fail("FILE_SIGNATURE_MISMATCH", "File is not a valid PNG");
  if (readU32BE(bytes, 8) !== 13 || String.fromCharCode(...bytes.slice(12, 16)) !== "IHDR") fail("MALFORMED_IMAGE", "PNG is missing its IHDR header");
  assertDimensions(readU32BE(bytes, 16), readU32BE(bytes, 20));
  const bitDepth = bytes[24]!;
  const colourType = bytes[25]!;
  if (![1, 2, 4, 8, 16].includes(bitDepth) || ![0, 2, 3, 4, 6].includes(colourType) || bytes[26] !== 0 || bytes[27] !== 0 || bytes[28] > 1) {
    fail("MALFORMED_IMAGE", "PNG has an unsupported or malformed IHDR header");
  }
  const depths: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
  if (!depths[colourType]?.includes(bitDepth)) fail("MALFORMED_IMAGE", "Invalid PNG colour/bit-depth combination");
  let offset = 8;
  let foundEnd = false, foundData = false, dataEnded = false, palette = false;
  while (offset + 12 <= bytes.length) {
    const length = readU32BE(bytes, offset);
    if (length > bytes.length - offset - 12) fail("MALFORMED_IMAGE", "PNG chunk is truncated");
    const kind = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
    if (crc32(bytes.subarray(offset + 4, offset + 8 + length)) !== readU32BE(bytes, offset + 8 + length)) fail("MALFORMED_IMAGE", "PNG chunk CRC mismatch");
    if (kind === "acTL" || kind === "fcTL" || kind === "fdAT") fail("MALFORMED_IMAGE", "Animated PNG is not supported");
    if (kind === "IHDR" && offset !== 8) fail("MALFORMED_IMAGE", "Duplicate PNG header");
    if (kind === "PLTE") {
      if (palette || foundData || !length || length % 3 || length > 768 || [0, 4].includes(colourType)) fail("MALFORMED_IMAGE", "Invalid PNG palette");
      palette = true;
    }
    if (kind === "IDAT") {
      if (dataEnded || (colourType === 3 && !palette)) fail("MALFORMED_IMAGE", "Invalid PNG data order");
      if (length) foundData = true;
    } else if (foundData) dataEnded = true;
    if (!/^[A-Za-z]{4}$/.test(kind) || (kind[0] === kind[0]!.toUpperCase() && !["IHDR", "PLTE", "IDAT", "IEND"].includes(kind))) fail("MALFORMED_IMAGE", "Unsupported critical PNG chunk");
    offset += 12 + length;
    if (kind === "IEND") { foundEnd = length === 0 && foundData && offset === bytes.length; break; }
  }
  if (!foundEnd) fail("MALFORMED_IMAGE", "PNG is truncated or missing its end chunk");
}

function validateJpeg(bytes: Uint8Array) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) fail("FILE_SIGNATURE_MISMATCH", "Not a JPEG");
  let offset = 2, frames = 0, scans = 0;
  while (offset < bytes.length) {
    if (bytes[offset++] !== 0xff) fail("MALFORMED_IMAGE", "Malformed JPEG marker");
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9) {
      if (offset !== bytes.length || frames !== 1 || scans === 0) fail("MALFORMED_IMAGE", "Incomplete JPEG");
      return;
    }
    if (marker === undefined || marker === 0 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) fail("MALFORMED_IMAGE", "Unexpected JPEG marker");
    if (marker === 0x01) continue;
    if (offset + 2 > bytes.length) fail("MALFORMED_IMAGE", "Truncated JPEG segment");
    const length = (bytes[offset]! << 8) | bytes[offset + 1]!;
    if (length < 2 || offset + length > bytes.length) fail("MALFORMED_IMAGE", "Invalid JPEG segment size");
    const frame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (frame) {
      if (![0xc0, 0xc1, 0xc2].includes(marker) || ++frames !== 1 || length < 8 || !bytes[offset + 7] || bytes[offset + 7]! > 4 || length !== 8 + 3 * bytes[offset + 7]!) fail("MALFORMED_IMAGE", "Unsupported or duplicate JPEG frame");
      assertDimensions((bytes[offset + 5]! << 8) | bytes[offset + 6]!, (bytes[offset + 3]! << 8) | bytes[offset + 4]!);
    }
    if (marker === 0xdc) fail("MALFORMED_IMAGE", "JPEG deferred dimensions unsupported");
    if (marker === 0xda) {
      if (frames !== 1 || length < 6 || !bytes[offset + 2] || length !== 6 + 2 * bytes[offset + 2]!) fail("MALFORMED_IMAGE", "Invalid JPEG scan");
      scans++;
      offset += length;
      const start = offset;
      while (offset < bytes.length) {
        if (bytes[offset] !== 0xff) { offset++; continue; }
        if (bytes[offset + 1] === 0 || (bytes[offset + 1]! >= 0xd0 && bytes[offset + 1]! <= 0xd7)) { offset += 2; continue; }
        break;
      }
      if (offset === start) fail("MALFORMED_IMAGE", "Empty JPEG scan");
    } else offset += length;
  }
  fail("MALFORMED_IMAGE", "Missing JPEG end marker");
}

function validateWebp(bytes: Uint8Array) {
  const text = (o: number) => String.fromCharCode(...bytes.subarray(o, o + 4));
  if (bytes.length < 20 || text(0) !== "RIFF" || text(8) !== "WEBP") fail("FILE_SIGNATURE_MISMATCH", "Not WebP");
  if (readU32LE(bytes, 4) + 8 !== bytes.length) fail("MALFORMED_IMAGE", "Invalid RIFF size");
  let p = 12, images = 0;
  let canvas: [number, number] | null = null;
  while (p < bytes.length) {
    if (p + 8 > bytes.length) fail("MALFORMED_IMAGE", "Truncated WebP chunk");
    const kind = text(p), size = readU32LE(bytes, p + 4), d = p + 8;
    if (d + size + (size % 2) > bytes.length) fail("MALFORMED_IMAGE", "Invalid WebP chunk size");
    if (kind === "ANIM" || kind === "ANMF") fail("MALFORMED_IMAGE", "Animated WebP unsupported");
    if (kind === "VP8X") {
      if (p !== 12 || size !== 10 || (bytes[d]! & 0xc3) || bytes[d + 1] || bytes[d + 2] || bytes[d + 3]) fail("MALFORMED_IMAGE", "Invalid/animated extended WebP");
      canvas = [1 + bytes[d + 4]! + (bytes[d + 5]! << 8) + (bytes[d + 6]! << 16), 1 + bytes[d + 7]! + (bytes[d + 8]! << 8) + (bytes[d + 9]! << 16)];
      assertDimensions(...canvas);
    } else if (kind === "VP8 " || kind === "VP8L") {
      if (++images !== 1) fail("MALFORMED_IMAGE", "Multiple WebP image payloads");
      let width: number, height: number;
      if (kind === "VP8L") {
        if (size <= 5 || bytes[d] !== 0x2f || (bytes[d + 4]! & 0xe0)) fail("MALFORMED_IMAGE", "Invalid VP8L header");
        const bits = readU32LE(bytes, d + 1);
        width = (bits & 0x3fff) + 1; height = ((bits >>> 14) & 0x3fff) + 1;
      } else {
        if (size <= 10 || (bytes[d]! & 1) || bytes[d + 3] !== 0x9d || bytes[d + 4] !== 1 || bytes[d + 5] !== 0x2a) fail("MALFORMED_IMAGE", "Invalid VP8 keyframe");
        width = readU16LE(bytes, d + 6) & 0x3fff; height = readU16LE(bytes, d + 8) & 0x3fff;
      }
      assertDimensions(width, height);
      if (canvas && (canvas[0] !== width || canvas[1] !== height)) fail("MALFORMED_IMAGE", "WebP canvas/image mismatch");
    } else if (!["ALPH", "ICCP", "EXIF", "XMP "].includes(kind)) fail("MALFORMED_IMAGE", "Unsupported WebP chunk");
    p = d + size + (size % 2);
  }
  if (images !== 1) fail("MALFORMED_IMAGE", "Missing WebP image payload");
}

export async function prepareConceptImage(file: File): Promise<PreparedUpload> {
  requireSize(file, MAX_CONCEPT_IMAGE_BYTES, "Concept image");
  const extension = extensionOf(file.name);
  const allowed: Record<string, { mime: PreparedUpload["contentType"]; extension: PreparedUpload["extension"]; validate: (bytes: Uint8Array) => void }> = {
    png: { mime: "image/png", extension: "png", validate: validatePng },
    jpg: { mime: "image/jpeg", extension: "jpg", validate: validateJpeg },
    jpeg: { mime: "image/jpeg", extension: "jpg", validate: validateJpeg },
    webp: { mime: "image/webp", extension: "webp", validate: validateWebp },
  };
  const expected = allowed[extension];
  if (!expected || file.type !== expected.mime) fail("INVALID_FILE_TYPE", "Use a PNG, JPEG, or WebP image with matching file extension and MIME type");
  const bytes = new Uint8Array(await file.arrayBuffer());
  expected.validate(bytes);
  return { bytes, extension: expected.extension, contentType: expected.mime, size: bytes.byteLength };
}

export async function prepareFinalZip(file: File): Promise<PreparedUpload> {
  requireSize(file, MAX_FINAL_ZIP_BYTES, "Final ZIP");
  if (extensionOf(file.name) !== "zip" || !["application/zip", "application/x-zip-compressed"].includes(file.type)) {
    fail("INVALID_FILE_TYPE", "Use a .zip file with an allowed ZIP MIME type");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length < 4 || readU32LE(bytes, 0) !== 0x04034b50) fail("FILE_SIGNATURE_MISMATCH", "File is not a standard ZIP archive");
  await validateZip(bytes);
  return { bytes, extension: "zip", contentType: "application/zip", size: bytes.byteLength };
}

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
  contentDisposition: string;
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
  let offset = 8;
  let foundEnd = false;
  while (offset + 12 <= bytes.length) {
    const length = readU32BE(bytes, offset);
    if (length > bytes.length - offset - 12) fail("MALFORMED_IMAGE", "PNG chunk is truncated");
    const kind = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
    offset += 12 + length;
    if (kind === "IEND") { foundEnd = offset === bytes.length; break; }
  }
  if (!foundEnd) fail("MALFORMED_IMAGE", "PNG is truncated or missing its end chunk");
}

function validateJpeg(bytes: Uint8Array) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) fail("FILE_SIGNATURE_MISMATCH", "File is not a valid JPEG");
  if (bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) fail("MALFORMED_IMAGE", "JPEG is truncated or missing its end marker");
  let offset = 2;
  let foundFrame = false;
  while (offset + 3 < bytes.length - 2) {
    if (bytes[offset] !== 0xff) fail("MALFORMED_IMAGE", "JPEG marker stream is malformed");
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++]!;
    if (marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) fail("MALFORMED_IMAGE", "JPEG segment is truncated");
    const length = (bytes[offset]! << 8) | bytes[offset + 1]!;
    if (length < 2 || offset + length > bytes.length) fail("MALFORMED_IMAGE", "JPEG segment length is invalid");
    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) {
      if (length < 8) fail("MALFORMED_IMAGE", "JPEG frame header is truncated");
      assertDimensions((bytes[offset + 5]! << 8) | bytes[offset + 6]!, (bytes[offset + 3]! << 8) | bytes[offset + 4]!);
      foundFrame = true;
    }
    if (marker === 0xda) {
      if (!foundFrame || offset + length >= bytes.length - 2) fail("MALFORMED_IMAGE", "JPEG has no complete decodable scan");
      return;
    }
    offset += length;
  }
  fail("MALFORMED_IMAGE", foundFrame ? "JPEG has no decodable scan" : "JPEG has no decodable frame header");
}

function validateWebp(bytes: Uint8Array) {
  const text = (offset: number, length: number) => String.fromCharCode(...bytes.slice(offset, offset + length));
  if (bytes.length < 20 || text(0, 4) !== "RIFF" || text(8, 4) !== "WEBP") fail("FILE_SIGNATURE_MISMATCH", "File is not a valid WebP image");
  if (readU32LE(bytes, 4) + 8 !== bytes.length) fail("MALFORMED_IMAGE", "WebP RIFF length does not match the file");
  const kind = text(12, 4);
  const chunkSize = readU32LE(bytes, 16);
  if (20 + chunkSize > bytes.length) fail("MALFORMED_IMAGE", "WebP image chunk is truncated");
  if (kind === "VP8X") {
    if (chunkSize < 10) fail("MALFORMED_IMAGE", "WebP extended header is truncated");
    const width = 1 + bytes[24]! + (bytes[25]! << 8) + (bytes[26]! << 16);
    const height = 1 + bytes[27]! + (bytes[28]! << 8) + (bytes[29]! << 16);
    assertDimensions(width, height);
  } else if (kind === "VP8L") {
    if (chunkSize < 5 || bytes[20] !== 0x2f) fail("MALFORMED_IMAGE", "WebP lossless header is malformed");
    const bits = readU32LE(bytes, 21);
    assertDimensions((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
  } else if (kind === "VP8 ") {
    if (chunkSize < 10 || bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) fail("MALFORMED_IMAGE", "WebP lossy frame header is malformed");
    assertDimensions(readU16LE(bytes, 26) & 0x3fff, readU16LE(bytes, 28) & 0x3fff);
  } else {
    fail("MALFORMED_IMAGE", "WebP has no supported decode chunk");
  }
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
  return { bytes, extension: expected.extension, contentType: expected.mime, size: bytes.byteLength, contentDisposition: "inline" };
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const minimum = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= minimum; offset--) {
    if (readU32LE(bytes, offset) === 0x06054b50 && offset + 22 + readU16LE(bytes, offset + 20) === bytes.length) return offset;
  }
  return -1;
}

function validateZip(bytes: Uint8Array) {
  if (bytes.length < 22 || readU32LE(bytes, 0) !== 0x04034b50) fail("FILE_SIGNATURE_MISMATCH", "File is not a standard ZIP archive");
  const eocd = findEndOfCentralDirectory(bytes);
  if (eocd < 0) fail("MALFORMED_ZIP", "ZIP central directory is missing or malformed");
  const disk = readU16LE(bytes, eocd + 4);
  const centralDisk = readU16LE(bytes, eocd + 6);
  const entriesOnDisk = readU16LE(bytes, eocd + 8);
  const entries = readU16LE(bytes, eocd + 10);
  const centralSize = readU32LE(bytes, eocd + 12);
  const centralOffset = readU32LE(bytes, eocd + 16);
  if (disk !== 0 || centralDisk !== 0 || entries !== entriesOnDisk || entries === 0) fail("MALFORMED_ZIP", "Multi-volume and empty ZIP archives are not supported");
  if (entries > MAX_FINAL_ZIP_ENTRIES) fail("ZIP_LIMIT_EXCEEDED", `ZIP exceeds the ${MAX_FINAL_ZIP_ENTRIES}-entry limit`);
  if (centralOffset + centralSize !== eocd || centralOffset >= bytes.length) fail("MALFORMED_ZIP", "ZIP central directory bounds are invalid");

  let offset = centralOffset;
  let totalCompressed = 0;
  let totalUncompressed = 0;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (let index = 0; index < entries; index++) {
    if (offset + 46 > eocd || readU32LE(bytes, offset) !== 0x02014b50) fail("MALFORMED_ZIP", "ZIP central directory entry is malformed");
    const flags = readU16LE(bytes, offset + 8);
    const method = readU16LE(bytes, offset + 10);
    const compressed = readU32LE(bytes, offset + 20);
    const uncompressed = readU32LE(bytes, offset + 24);
    const nameLength = readU16LE(bytes, offset + 28);
    const extraLength = readU16LE(bytes, offset + 30);
    const commentLength = readU16LE(bytes, offset + 32);
    const localOffset = readU32LE(bytes, offset + 42);
    const end = offset + 46 + nameLength + extraLength + commentLength;
    if (end > eocd || compressed === 0xffffffff || uncompressed === 0xffffffff || localOffset === 0xffffffff) fail("MALFORMED_ZIP", "ZIP64 or truncated entries are not supported");
    if ((flags & 1) !== 0) fail("MALFORMED_ZIP", "Encrypted ZIP entries are not supported");
    if (![0, 8].includes(method)) fail("MALFORMED_ZIP", "ZIP uses an unsupported compression method");
    let name: string;
    try { name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength)); } catch { fail("MALFORMED_ZIP", "ZIP entry name is not valid UTF-8"); }
    if (!name! || name!.includes("\0") || name!.startsWith("/") || name!.startsWith("\\") || /^[a-z]:/i.test(name!) || name!.split(/[\\/]/).includes("..")) fail("MALFORMED_ZIP", "ZIP contains an unsafe entry path");
    if (localOffset + 30 > centralOffset || readU32LE(bytes, localOffset) !== 0x04034b50) fail("MALFORMED_ZIP", "ZIP local entry header is invalid");
    const localFlags = readU16LE(bytes, localOffset + 6);
    const localMethod = readU16LE(bytes, localOffset + 8);
    const localNameLength = readU16LE(bytes, localOffset + 26);
    const localExtraLength = readU16LE(bytes, localOffset + 28);
    const localDataOffset = localOffset + 30 + localNameLength + localExtraLength;
    if (localMethod !== method || localFlags !== flags || localDataOffset + compressed > centralOffset) fail("MALFORMED_ZIP", "ZIP local entry bounds do not match its directory");
    totalCompressed += compressed;
    totalUncompressed += uncompressed;
    if (totalUncompressed > MAX_FINAL_ZIP_UNCOMPRESSED_BYTES) fail("ZIP_LIMIT_EXCEEDED", `ZIP expands beyond the ${MAX_FINAL_ZIP_UNCOMPRESSED_BYTES / MIB} MB limit`);
    offset = end;
  }
  if (offset !== eocd) fail("MALFORMED_ZIP", "ZIP central directory length is inconsistent");
  if (totalUncompressed > 0 && totalUncompressed / Math.max(totalCompressed, 1) > MAX_FINAL_ZIP_COMPRESSION_RATIO) fail("ZIP_LIMIT_EXCEEDED", `ZIP compression ratio exceeds ${MAX_FINAL_ZIP_COMPRESSION_RATIO}:1`);
}

export async function prepareFinalZip(file: File): Promise<PreparedUpload> {
  requireSize(file, MAX_FINAL_ZIP_BYTES, "Final ZIP");
  if (extensionOf(file.name) !== "zip" || !["application/zip", "application/x-zip-compressed"].includes(file.type)) {
    fail("INVALID_FILE_TYPE", "Use a .zip file with an allowed ZIP MIME type");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  validateZip(bytes);
  return { bytes, extension: "zip", contentType: "application/zip", size: bytes.byteLength, contentDisposition: 'attachment; filename="final-deliverables.zip"' };
}

import { createInflateRaw } from "node:zlib";
import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { UploadValidationError, MAX_FINAL_ZIP_ENTRIES, MAX_FINAL_ZIP_UNCOMPRESSED_BYTES, MAX_FINAL_ZIP_COMPRESSION_RATIO } from "./upload-validation";

const bad = (message: string): never => { throw new UploadValidationError("MALFORMED_ZIP", message); };
const limit = (): never => { throw new UploadValidationError("ZIP_LIMIT_EXCEEDED", "ZIP exceeds actual expanded-size or per-entry compression ratio limit"); };
const table = Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
export function updateCrc(crc: number, bytes: Uint8Array) {
  for (const byte of bytes) crc = table[(crc ^ byte) & 255]! ^ (crc >>> 8);
  return crc >>> 0;
}
export const crc32 = (bytes: Uint8Array) => (updateCrc(0xffffffff, bytes) ^ 0xffffffff) >>> 0;
const cp437 = "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ";
function decodeName(bytes: Uint8Array, utf8: boolean) {
  if (!utf8) return Array.from(bytes, b => b < 128 ? String.fromCharCode(b) : cp437[b - 128]).join("");
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return bad("Invalid UTF-8 entry name"); }
}
function safeName(name: string) {
  // Portable extraction policy: reject aliases rather than guessing the target OS.
  if (!name || name !== name.normalize("NFKC") || /[\\\x00-\x1f\x7f:]/.test(name) || name.startsWith("/")) bad("Unsafe or noncanonical ZIP path");
  const parts = name.replace(/\/$/, "").split("/");
  if (parts.some(p => !p || p === "." || p === ".." || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) bad("Unsafe ZIP path component");
  return parts.join("/").toLowerCase();
}

export async function validateZip(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (o: number) => view.getUint16(o, true);
  const u32 = (o: number) => view.getUint32(o, true);
  if (bytes.length < 22 || u32(0) !== 0x04034b50) bad("Not a nonempty standard ZIP");
  let eocd = -1;
  for (let p = bytes.length - 22; p >= Math.max(0, bytes.length - 65557); p--) {
    if (u32(p) === 0x06054b50 && p + 22 + u16(p + 20) === bytes.length) { eocd = p; break; }
  }
  if (eocd < 0) bad("Missing end directory");
  const count = u16(eocd + 10), central = u32(eocd + 16);
  if (u16(eocd + 4) || u16(eocd + 6) || count !== u16(eocd + 8) || !count) bad("Multivolume/empty ZIP unsupported");
  if (count > MAX_FINAL_ZIP_ENTRIES) limit();
  if (central + u32(eocd + 12) !== eocd) bad("Invalid directory bounds");
  function extras(start: number, length: number) {
    const end = start + length;
    while (start < end) {
      if (start + 4 > end || start + 4 + u16(start + 2) > end) bad("Truncated extra field");
      // Reject alternate effective names, ZIP64, and Unix link metadata. Ordinary
      // timestamps/uid/gid extras remain compatible. No extractor-visible override.
      if ([0x7075, 0x6375, 0x0001, 0x000d, 0x756e].includes(u16(start))) bad("Unsupported path/link/ZIP64 extra field");
      start += 4 + u16(start + 2);
    }
  }
  const records: { start: number; end: number; data: number; compressed: number; size: number; crc: number; method: number }[] = [];
  const names = new Map<string, boolean>();
  let p = central;
  for (let i = 0; i < count; i++) {
    if (p + 46 > eocd || u32(p) !== 0x02014b50) bad("Invalid central record");
    const flags = u16(p + 8), method = u16(p + 10), crc = u32(p + 16), compressed = u32(p + 20), size = u32(p + 24);
    const nl = u16(p + 28), xl = u16(p + 30), cl = u16(p + 32), local = u32(p + 42);
    if (p + 46 + nl + xl + cl > eocd || u16(p + 34) || [size, compressed, local].includes(0xffffffff)) bad("Truncated, split or ZIP64 record");
    if ((flags & ~(0x800 | 8 | 6)) || ![0, 8].includes(method) || (method === 0 && (flags & 6))) bad("Unsupported flags/compression/encryption");
    const name = decodeName(bytes.subarray(p + 46, p + 46 + nl), !!(flags & 0x800));
    const key = safeName(name), directory = name.endsWith("/");
    if (names.has(key)) bad("Colliding ZIP names");
    names.set(key, directory);
    const attr = u32(p + 38), unixType = (attr >>> 16) & 0xf000;
    if ((unixType && unixType !== 0x8000 && unixType !== 0x4000) || (attr & 8) || (unixType === 0x4000 && !directory) || (unixType === 0x8000 && directory) || ((attr & 16) && !directory)) bad("Symlink/special file or inconsistent directory attributes");
    extras(p + 46 + nl, xl);
    if (local + 30 > central || u32(local) !== 0x04034b50) bad("Invalid local header");
    const lnl = u16(local + 26), lxl = u16(local + 28), data = local + 30 + lnl + lxl;
    if (data + compressed > central || u16(local + 6) !== flags || u16(local + 8) !== method) bad("Local header mismatch");
    const localName = decodeName(bytes.subarray(local + 30, local + 30 + lnl), !!(flags & 0x800));
    safeName(localName);
    if (localName !== name) bad("Local and central names differ");
    extras(local + 30 + lnl, lxl);
    let end = data + compressed;
    if (flags & 8) {
      for (const [off, expected] of [[14, crc], [18, compressed], [22, size]]) {
        if (u32(local + off!) !== 0 && u32(local + off!) !== expected) bad("Inconsistent local descriptor fields");
      }
      // Both signed and unsigned standard descriptors are supported. Compare all
      // fields, so CRC equal to the optional signature is unambiguous.
      const matches = (q: number) => q + 12 <= central && u32(q) === crc && u32(q + 4) === compressed && u32(q + 8) === size;
      if (end + 16 <= central && u32(end) === 0x08074b50 && matches(end + 4)) end += 16;
      else if (matches(end)) end += 12;
      else bad("Invalid data descriptor");
    } else if (u32(local + 14) !== crc || u32(local + 18) !== compressed || u32(local + 22) !== size) bad("Local size/CRC mismatch");
    if (method === 0 && compressed !== size) bad("Stored size mismatch");
    if (directory && (size || crc || (method === 0 && compressed))) bad("Directory contains payload");
    if (size > MAX_FINAL_ZIP_UNCOMPRESSED_BYTES || size > Math.max(1, compressed) * MAX_FINAL_ZIP_COMPRESSION_RATIO) limit();
    records.push({ start: local, end, data, compressed, size, crc, method });
    p += 46 + nl + xl + cl;
  }
  if (p !== eocd) bad("Directory length mismatch");
  const sorted = [...records].sort((a, b) => a.start - b.start);
  let end = 0;
  for (const r of sorted) { if (r.start !== end) bad("Overlapping or unreferenced local records"); end = r.end; }
  if (end !== central) bad("Unexpected data before directory");
  for (const key of names.keys()) {
    const parts = key.split("/");
    for (let i = 1; i < parts.length; i++) if (names.get(parts.slice(0, i).join("/")) === false) bad("File used as ancestor directory");
  }
  let total = 0;
  for (const r of records) {
    let actual = 0, crc = 0xffffffff;
    const account = (chunk: Uint8Array) => {
      actual += chunk.length; total += chunk.length;
      if (actual > r.size || total > MAX_FINAL_ZIP_UNCOMPRESSED_BYTES || actual > Math.max(1, r.compressed) * MAX_FINAL_ZIP_COMPRESSION_RATIO) limit();
      crc = updateCrc(crc, chunk);
    };
    const payload = bytes.subarray(r.data, r.data + r.compressed);
    if (r.method === 0) account(payload);
    else {
      const inflate = createInflateRaw({ chunkSize: 16 * 1024 });
      const sink = new Writable({ highWaterMark: 16 * 1024, write(chunk, _encoding, cb) {
        try { account(chunk); cb(); } catch (error) { cb(error as Error); }
      } });
      try {
        await pipeline(Readable.from((function* () {
          for (let i = 0; i < payload.length; i += 16 * 1024) yield payload.subarray(i, i + 16 * 1024);
        })()), inflate, sink);
      } catch (error) {
        if (error instanceof UploadValidationError) throw error;
        bad("Invalid or truncated deflate stream");
      }
      if (inflate.bytesWritten !== r.compressed) bad("Trailing compressed data");
    }
    if (actual !== r.size || ((crc ^ 0xffffffff) >>> 0) !== r.crc) bad("Actual size/CRC mismatch");
  }
}

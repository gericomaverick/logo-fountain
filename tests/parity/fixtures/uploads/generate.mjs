#!/usr/bin/env node
// Golden upload corpus generator (story 0.6a, inventory X-12).
//
// Builds every corpus file deterministically from this script alone: no
// dependencies, no system zlib (DEFLATE is encoded by a small fixed-Huffman
// encoder below, so the bytes don't change with the Node or zlib version).
//
//   node generate.mjs              write committed files + manifest.json, and build .generated/
//   node generate.mjs --committed  write committed files + manifest.json only
//   node generate.mjs --generated  build missing/stale large files into .generated/ (git-ignored)
//   node generate.mjs --check      rebuild committed files in memory; fail if disk or manifest differ
//
// manifest.json keeps the captured fields (expectedCode, laravelExpectedCode)
// across regenerations. expectedCode is captured from Next by
// apps/web/src/lib/__tests__/golden-upload-corpus.test.ts (CAPTURE=1), never by hand.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST = join(HERE, "manifest.json");
const MIB = 1024 * 1024;
const enc = new TextEncoder();

// ---------------------------------------------------------------- bytes ----
function concat(...parts) {
  const list = parts.flat(Infinity).map((p) => (typeof p === "number" ? Uint8Array.of(p) : typeof p === "string" ? enc.encode(p) : p));
  const out = new Uint8Array(list.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of list) { out.set(p, o); o += p.length; }
  return out;
}
const u16le = (v) => Uint8Array.of(v & 255, (v >>> 8) & 255);
const u32le = (v) => Uint8Array.of(v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255);
const u16be = (v) => Uint8Array.of((v >>> 8) & 255, v & 255);
const u32be = (v) => Uint8Array.of((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
const latin1 = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const repeat = (byte, n) => new Uint8Array(n).fill(byte);
const b64 = (s) => Uint8Array.from(Buffer.from(s, "base64"));
function patch(bytes, offset, values) { const out = Uint8Array.from(bytes); out.set(values, offset); return out; }
function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randomBytes(seed, n) { const r = mulberry32(seed); return Uint8Array.from({ length: n }, () => Math.floor(r() * 256)); }

// ------------------------------------------------------------------ crc ----
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crcUpdate(reg, bytes) { for (let i = 0; i < bytes.length; i++) reg = CRC_TABLE[(reg ^ bytes[i]) & 255] ^ (reg >>> 8); return reg >>> 0; }
const crc32 = (bytes) => (crcUpdate(0xffffffff, bytes) ^ 0xffffffff) >>> 0;
const CRC_REV = new Map([...CRC_TABLE].map((v, i) => [v >>> 24, i]));
// Append 4 bytes so that crc32(result) === target (classic CRC reversal).
function forceCrc(prefix, target) {
  const idx = [];
  let r = (target ^ 0xffffffff) >>> 0;
  for (let k = 3; k >= 0; k--) { idx[k] = CRC_REV.get(r >>> 24); r = ((r ^ CRC_TABLE[idx[k]]) << 8) >>> 0; }
  let reg = crcUpdate(0xffffffff, prefix);
  const tail = [];
  for (let k = 0; k < 4; k++) { const b = (idx[k] ^ reg) & 255; tail.push(b); reg = (CRC_TABLE[(reg ^ b) & 255] ^ (reg >>> 8)) >>> 0; }
  const out = concat(prefix, Uint8Array.from(tail));
  if (crc32(out) !== target >>> 0) throw new Error("forceCrc failed");
  return out;
}
function adler32(bytes) {
  let a = 1, b = 0;
  for (let i = 0; i < bytes.length; i++) { a = (a + bytes[i]) % 65521; b = (b + a) % 65521; }
  return ((b << 16) | a) >>> 0;
}

// -------------------------------------------------------------- deflate ----
// Single final fixed-Huffman block; tokens are literals and distance-1 runs.
const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
function litCode(v) { return v < 144 ? [0x30 + v, 8] : v < 256 ? [0x190 + v - 144, 9] : v < 280 ? [v - 256, 7] : [0xc0 + v - 280, 8]; }
function lenSymbol(len) { let i = LEN_BASE.length - 1; while (LEN_BASE[i] > len) i--; return i; }
const litBits = (v) => litCode(v)[1];
const matchBits = (len) => { const i = lenSymbol(len); return litCode(257 + i)[1] + LEN_EXTRA[i] + 5; };
function runSplit(rem) { // lengths of distance-1 matches covering `rem` repeats; leftover < 3 become literals
  const out = [];
  while (rem >= 3) { const take = rem >= 261 || rem === 258 ? 258 : rem > 258 ? rem - 3 : rem; out.push(take); rem -= take; }
  return { matches: out, literals: rem };
}
class BitWriter {
  constructor(capacity = 1024) { this.buf = new Uint8Array(capacity); this.len = 0; this.acc = 0; this.n = 0; }
  push(b) { if (this.len === this.buf.length) { const g = new Uint8Array(this.buf.length * 2); g.set(this.buf); this.buf = g; } this.buf[this.len++] = b; }
  bits(value, count) { this.acc |= value << this.n; this.n += count; while (this.n >= 8) { this.push(this.acc & 255); this.acc >>>= 8; this.n -= 8; } }
  huff([code, len]) { let rev = 0; for (let i = 0; i < len; i++) rev = (rev << 1) | ((code >>> i) & 1); this.bits(rev, len); }
  finish() { if (this.n > 0) this.push(this.acc & 255); this.acc = 0; this.n = 0; return this.buf.slice(0, this.len); }
}
function deflateRaw(bytes) {
  const w = new BitWriter(Math.max(1024, bytes.length >>> 4));
  w.bits(1, 1); w.bits(1, 2); // BFINAL, BTYPE=01 (fixed Huffman)
  const literal = (v) => w.huff(litCode(v));
  const match = (len) => { const i = lenSymbol(len); w.huff(litCode(257 + i)); if (LEN_EXTRA[i]) w.bits(len - LEN_BASE[i], LEN_EXTRA[i]); w.bits(0, 5); };
  for (let i = 0; i < bytes.length;) {
    const v = bytes[i];
    let j = i + 1;
    while (j < bytes.length && bytes[j] === v) j++;
    literal(v);
    const { matches, literals } = runSplit(j - i - 1);
    for (const m of matches) match(m);
    for (let k = 0; k < literals; k++) literal(v);
    i = j;
  }
  w.huff(litCode(256));
  return w.finish();
}
// Exact compressed size of deflateRaw(concat(prefix, zeros(z))) when prefix ends in a nonzero byte.
function deflatedSizeWithZeros(prefixBits, z) {
  const { matches, literals } = runSplit(z - 1);
  const bits = 3 + prefixBits + 8 + matches.reduce((n, m) => n + matchBits(m), 0) + literals * 8 + 7;
  return Math.ceil(bits / 8);
}
const zlibWrap = (raw) => concat(0x78, 0x01, deflateRaw(raw), u32be(adler32(raw)));

// ------------------------------------------------------------------ PNG ----
const PNG_SIG = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
function chunk(type, data = new Uint8Array(), { crcXor = 0, length } = {}) {
  const body = concat(latin1(type), data);
  return concat(u32be(length ?? data.length), body, u32be((crc32(body) ^ crcXor) >>> 0));
}
const ihdrData = (w, h, depth = 8, ct = 6, comp = 0, filter = 0, interlace = 0) => concat(u32be(w), u32be(h), depth, ct, comp, filter, interlace);
const IHDR = (...a) => chunk("IHDR", ihdrData(...a));
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
function scanlines(w, h, depth, ct) {
  const rowBytes = Math.ceil((w * CHANNELS[ct] * depth) / 8);
  const rows = [];
  for (let y = 0; y < h; y++) rows.push(0, Uint8Array.from({ length: rowBytes }, (_, x) => (x * 37 + y * 101 + 17) & 255));
  return concat(rows);
}
const IDAT = (w, h, depth = 8, ct = 6) => chunk("IDAT", zlibWrap(scanlines(w, h, depth, ct)));
const IEND = () => chunk("IEND");
const png = (...chunks) => concat(PNG_SIG, chunks);
const pngRgba = (w = 8, h = 8) => png(IHDR(w, h), IDAT(w, h), IEND());
// A header-only PNG: the IHDR claims w×h but the tiny IDAT is not a full image.
const pngHeaderOnly = (w, h) => png(IHDR(w, h), IDAT(1, 1), IEND());
const PALETTE = concat(0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255);
function pngPadded(totalBytes) { // valid RGBA PNG padded with a tEXt chunk to an exact size
  const base = pngRgba();
  const textLength = totalBytes - base.length - 12;
  const text = concat("Comment\0", repeat(0x78, textLength - 8));
  return concat(base.subarray(0, base.length - 12), chunk("tEXt", text), IEND());
}

// ----------------------------------------------------------------- JPEG ----
// Seeds encoded once with sharp/libjpeg-turbo/libwebp (8×8 gradient), then frozen here.
const SEED = {
  jpegBaseline: "/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAeEAACAQMFAAAAAAAAAAAAAAAREgEAAwYCMTJRcf/EABUBAQEAAAAAAAAAAAAAAAAAAAME/8QAHREAAQIHAAAAAAAAAAAAAAAABQAEAQIDExQhIv/aAAwDAQACEQMRAD8AuY/hjKbbHcwST6S09lp5Nqm8pSoXJGvcjtOCKucSXpf/2Q==",
  jpegProgressive: "/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wgARCAAIAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAT/xAAVAQEBAAAAAAAAAAAAAAAAAAACA//aAAwDAQACEAMQAAABuEH/AP/EABUQAQEAAAAAAAAAAAAAAAAAAAQA/9oACAEBAAEFAjjv/8QAGREAAQUAAAAAAAAAAAAAAAAABAABAxMh/9oACAEDAQE/AQSpKm1f/8QAGBEAAgMAAAAAAAAAAAAAAAAAAAIDBBL/2gAIAQIBAT8BksPo/8QAFhABAQEAAAAAAAAAAAAAAAAA8DFR/9oACAEBAAY/AoN//8QAGxAAAQQDAAAAAAAAAAAAAAAAEQABMUGh4fD/2gAIAQEAAT8hKJdvNl1//9oADAMBAAIAAwAAABAH/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB5/8QAFhEAAwAAAAAAAAAAAAAAAAAAABEh/9oACAECAQE/EH1P/8QAGxABAAEFAQAAAAAAAAAAAAAAETEAASFBUXH/2gAIAQEAAT8QlMktlX1V1WxT/9k=",
  webpLossy: "UklGRmYAAABXRUJQVlA4IFoAAACQAgCdASoIAAgAAUAmJbACdAaVOiA/QAzMqDgawAD+0gfThkLLN0Fqf66HljsFlseHbzA2fONPP89K8YDZuAv17w6rhHfT5F56EH/+XNHf5SvvD/dv/jKwAAA=",
  webpLossless: "UklGRjgAAABXRUJQVlA4TCsAAAAvB8ABELmM6H/sIgre/wBhtlFR5s95ryMYkAH8XyDBJE21HcOi80W3+j4FAA==",
  webpLossyAlpha: "UklGRngAAABXRUJQVlA4WAoAAAAQAAAABwAABwAAQUxQSA4AAAABD/DA/4iI8CrViP6HKlZQOCBEAAAA0AEAnQEqCAAIAAFAJiWwAnQBDwwETFAA/vufjLvQzvlhfnrKSoYK+zN+TP03cek///tf4Trh/8KX3M/9p/9iisOAAAA=",
};
const JPEG = b64(SEED.jpegBaseline);
const JPEG_PROGRESSIVE = b64(SEED.jpegProgressive);
const seg = (marker, payload = new Uint8Array()) => concat(0xff, marker, u16be(payload.length + 2), payload);
// Offset of the first marker `m` in a JPEG's header segments (before the first SOS data).
function jpegMarkerOffset(bytes, m) {
  for (let p = 2; p < bytes.length;) {
    if (bytes[p + 1] === m) return p;
    p += 2 + ((bytes[p + 2] << 8) | bytes[p + 3]);
  }
  throw new Error(`marker ${m.toString(16)} not found`);
}
const sofPayload = (w, h, n = 1, { length } = {}) => concat(8, u16be(h), u16be(w), n, Array.from({ length: length ?? n }, (_, i) => Uint8Array.of(i + 1, 0x11, 0)));
const sosPayload = (n = 1) => concat(n, Array.from({ length: n }, (_, i) => Uint8Array.of(i + 1, 0)), 0, 0x3f, 0);
const SOI = Uint8Array.of(0xff, 0xd8), EOI = Uint8Array.of(0xff, 0xd9);
// Structure-only JPEG (no tables): SOI, SOF, SOS, entropy bytes, EOI.
function jpegMin({ sof = 0xc0, w = 8, h = 8, n = 1, before = [], scan = [0x12, 0x34], after = [], eoi = true } = {}) {
  return concat(SOI, before, seg(sof, sofPayload(w, h, n)), seg(0xda, sosPayload(n)), Uint8Array.from(scan), after, eoi ? EOI : []);
}
function jpegWithSofDims(bytes, w, h) { const o = jpegMarkerOffset(bytes, 0xc0); return patch(bytes, o + 5, concat(u16be(h), u16be(w))); }
function insertBefore(bytes, offset, insert) { return concat(bytes.subarray(0, offset), insert, bytes.subarray(offset)); }

// ----------------------------------------------------------------- WebP ----
const webpChunk = (fourcc, data, { size } = {}) => concat(latin1(fourcc), u32le(size ?? data.length), data, data.length % 2 ? 0 : []);
const riff = (body, { sizeDelta = 0 } = {}) => concat("RIFF", u32le(body.length + 4 + sizeDelta), "WEBP", body);
const webp = (...chunks) => riff(concat(chunks));
function webpChunks(bytes) { // seed → [{fourcc, data}]
  const out = [];
  for (let p = 12; p < bytes.length;) {
    const size = bytes[p + 4] | (bytes[p + 5] << 8) | (bytes[p + 6] << 16) | (bytes[p + 7] << 24);
    out.push({ fourcc: String.fromCharCode(...bytes.subarray(p, p + 4)), data: bytes.slice(p + 8, p + 8 + size) });
    p += 8 + size + (size % 2);
  }
  return out;
}
const VP8_DATA = webpChunks(b64(SEED.webpLossy))[0].data;
const VP8L_DATA = webpChunks(b64(SEED.webpLossless))[0].data;
const [, ALPH_DATA, VP8_ALPHA_DATA] = webpChunks(b64(SEED.webpLossyAlpha)).map((c) => c.data);
const vp8xData = (flags, w, h, { reserved = [0, 0, 0] } = {}) => concat(flags, Uint8Array.from(reserved), u32le(w - 1).subarray(0, 3), u32le(h - 1).subarray(0, 3));
const VP8X = (flags, w, h, opts) => webpChunk("VP8X", vp8xData(flags, w, h, opts));
const VP8 = (data = VP8_DATA) => webpChunk("VP8 ", data);
const VP8L = (data = VP8L_DATA) => webpChunk("VP8L", data);
function vp8lWithDims(w, h) { // keep alpha hint + version bits of the seed
  const bits = (VP8L_DATA[1] | (VP8L_DATA[2] << 8) | (VP8L_DATA[3] << 16) | (VP8L_DATA[4] << 24)) >>> 0;
  return patch(VP8L_DATA, 1, u32le(((bits & 0xf0000000) | ((h - 1) << 14) | (w - 1)) >>> 0));
}
const vp8WithDims = (w, h) => patch(VP8_DATA, 6, concat(u16le(w), u16le(h)));

// ------------------------------------------------------------------ ZIP ----
const FILE_ATTR = (0o100644 << 16) >>> 0;
const DIR_ATTR = ((0o40755 << 16) | 0x10) >>> 0;
const DOS_TIME = 0, DOS_DATE = 0x21; // 1980-01-01 00:00
// entry: { name, data, method (0|8), utf8, flags, payload, crc, size, csize, descriptor ("signed"|"unsigned"),
//   descriptorFields, localFields, local: {flags, method, crc, csize, size, name}, extra, localExtra,
//   attr, madeBy, offset, skipLocal }
function zipEntry(e) {
  const name = typeof e.name === "string" ? enc.encode(e.name) : e.name;
  const data = typeof e.data === "string" ? enc.encode(e.data) : e.data ?? new Uint8Array();
  const method = e.method ?? 0;
  const payload = e.payload ?? (method === 8 ? deflateRaw(data) : data);
  const flags = e.flags ?? ((e.utf8 ? 0x800 : 0) | (e.descriptor ? 8 : 0));
  const crc = e.crc ?? crc32(data), csize = e.csize ?? payload.length, size = e.size ?? data.length;
  const L = { flags, method, crc, csize, size, name, ...(e.descriptor && !e.localFields ? { crc: 0, csize: 0, size: 0 } : {}), ...e.local };
  const lname = typeof L.name === "string" ? enc.encode(L.name) : L.name;
  const lextra = e.localExtra ?? e.extra ?? new Uint8Array();
  const d = e.descriptorFields ?? { crc, csize, size };
  const descriptor = e.descriptor === "signed" ? concat(u32le(0x08074b50), u32le(d.crc), u32le(d.csize), u32le(d.size))
    : e.descriptor === "unsigned" ? concat(u32le(d.crc), u32le(d.csize), u32le(d.size)) : new Uint8Array();
  const local = concat(u32le(0x04034b50), u16le(20), u16le(L.flags), u16le(L.method), u16le(DOS_TIME), u16le(DOS_DATE),
    u32le(L.crc), u32le(L.csize), u32le(L.size), u16le(lname.length), u16le(lextra.length), lname, lextra, payload, descriptor);
  const isDir = name.length > 0 && name[name.length - 1] === 0x2f;
  const extra = e.extra ?? new Uint8Array(), comment = e.comment ?? new Uint8Array();
  const central = (offset) => concat(u32le(0x02014b50), u16le(e.madeBy ?? 0x031e), u16le(20), u16le(flags), u16le(method), u16le(DOS_TIME), u16le(DOS_DATE),
    u32le(crc), u32le(csize), u32le(size), u16le(name.length), u16le(extra.length), u16le(comment.length), u16le(e.disk ?? 0), u16le(0),
    u32le(e.attr ?? (isDir ? DIR_ATTR : FILE_ATTR)), u32le(e.offset ?? offset), name, extra, comment);
  return { local, central };
}
// opts: { prefix, between: {index: bytes}, beforeCentral, centralTail, beforeEocd, comment, eocd: {...overrides}, trailing }
function zip(entries, opts = {}) {
  const parts = [], centrals = [];
  let offset = 0;
  const put = (b) => { parts.push(b); offset += b.length; };
  if (opts.prefix) put(opts.prefix);
  entries.forEach((e, i) => {
    if (opts.between?.[i]) put(opts.between[i]);
    const built = zipEntry(e);
    centrals.push(built.central(offset));
    if (!e.skipLocal) put(built.local);
  });
  if (opts.beforeCentral) put(opts.beforeCentral);
  const cdOffset = offset;
  const cd = concat(centrals, opts.centralTail ?? []);
  put(cd);
  if (opts.beforeEocd) put(opts.beforeEocd);
  const comment = typeof opts.comment === "string" ? enc.encode(opts.comment) : opts.comment ?? new Uint8Array();
  const E = { disk: 0, cdDisk: 0, countDisk: entries.length, count: entries.length, cdSize: cd.length, cdOffset, commentLength: comment.length, ...opts.eocd };
  put(concat(u32le(0x06054b50), u16le(E.disk), u16le(E.cdDisk), u16le(E.countDisk), u16le(E.count), u32le(E.cdSize), u32le(E.cdOffset), u16le(E.commentLength), comment));
  if (opts.trailing) put(opts.trailing);
  return concat(parts);
}
// Patch the single central record of a one-entry, comment-less archive named "logo.svg".
const patchCentral = (bytes, at, values) => patch(bytes, bytes.length - 22 - (46 + 8) + at, values);
const extraField = (id, data) => concat(u16le(id), u16le(data.length), data);
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#e85d04"/></svg>\n';
const README = "Logo Fountain final files.\n".repeat(20);
const basicZip = (name = "logo.svg", extra = {}) => zip([{ name, data: SVG, method: 8, ...extra }]);
// A valid single stored entry zip of exactly `total` bytes (zeros payload).
function zipOfSize(total) {
  const name = "artwork.bin", overhead = 30 + name.length + 46 + name.length + 22;
  return zip([{ name, data: new Uint8Array(total - overhead) }]);
}
// Pseudo-random head + zeros, sized so that uncompressed === ratio × compressed exactly.
function ratioEntry(ratio, seed = 7) {
  const head = concat(randomBytes(seed, 600).map((b) => b || 1));
  let headBits = 0;
  for (let i = 0; i < head.length;) { let j = i + 1; while (j < head.length && head[j] === head[i]) j++; const { matches, literals } = runSplit(j - i - 1); headBits += litBits(head[i]) * (1 + literals) + matches.reduce((n, m) => n + matchBits(m), 0); i = j; }
  for (let z = 1; z < 10_000_000; z++) {
    const c = deflatedSizeWithZeros(headBits, z);
    if (head.length + z === ratio * c) {
      const data = concat(head, new Uint8Array(z)), payload = deflateRaw(data);
      if (payload.length !== c) throw new Error("ratio size prediction failed");
      return { data, payload };
    }
  }
  throw new Error("no exact ratio found");
}
// 6 deflate entries × 100 MiB actual (each within the 100× ratio): actual total 600 MiB > 500 MiB.
function zipTotalOverLimit() {
  const block = concat(randomBytes(11, 160).map((b) => b || 1), new Uint8Array(25_000));
  const data = new Uint8Array(100 * MIB);
  for (let o = 0; o < data.length; o += block.length) data.set(block.subarray(0, Math.min(block.length, data.length - o)), o);
  const payload = deflateRaw(data), crc = crc32(data);
  if (data.length > payload.length * 100) throw new Error("total-limit entry exceeds ratio");
  return zip(Array.from({ length: 6 }, (_, i) => ({ name: `part-${i + 1}.bin`, method: 8, payload, crc, size: data.length })));
}
function manyEntries(n) { return zip(Array.from({ length: n }, (_, i) => ({ name: `files/f${String(i).padStart(4, "0")}.txt` }))); }
function overlappingZip() {
  const inner = zipEntry({ name: "b.txt", data: "inner" }).local;
  const outerName = "a.txt";
  return zip([{ name: outerName, data: inner }, { name: "b.txt", data: "inner", offset: 30 + outerName.length, skipLocal: true }]);
}
const orphanLocal = zipEntry({ name: "orphan.txt", data: "orphan" }).local;
const zip64Eocd = concat(u32le(0x06064b50), new Uint8Array(52), u32le(0x07064b50), new Uint8Array(16));
const GIF = b64("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==");

// ---------------------------------------------------------------- cases ----
// branch: the Next validator message the case is designed to reach (null = accepted).
// It is verified against Next's actual message by the Vitest corpus test.
const cases = [];
const IMG = (id, ext, filename, mime, branch, note, build, more = {}) => cases.push({ id, kind: "image", ext, filename, mime, branch, note, build, ...more });
const ZIP = (id, filename, mime, branch, note, build, more = {}) => cases.push({ id, kind: "zip", ext: "zip", filename, mime, branch, note, build, ...more });
const PNG = (id, branch, note, build, more) => IMG(id, "png", "logo.png", "image/png", branch, note, build, more);
const JPG = (id, branch, note, build, more) => IMG(id, "jpg", "logo.jpg", "image/jpeg", branch, note, build, more);
const WEBP = (id, branch, note, build, more) => IMG(id, "webp", "logo.webp", "image/webp", branch, note, build, more);
const Z = (id, branch, note, build, more) => ZIP(id, "final.zip", "application/zip", branch, note, build, more);

const M = {
  required: "Concept image is empty", tooLarge: "Concept image exceeds the 10 MB limit",
  type: "Use a PNG, JPEG, or WebP image with matching file extension and MIME type",
  dims: "Image has invalid dimensions", pixels: "Image exceeds the 40,000,000-pixel decode limit",
  zipRequired: "Final ZIP is empty", zipTooLarge: "Final ZIP exceeds the 100 MB limit", zipType: "Use a .zip file with an allowed ZIP MIME type",
  zipSig: "File is not a standard ZIP archive", zipLimit: "ZIP exceeds actual expanded-size or per-entry compression ratio limit",
  unsafePath: "Unsafe or noncanonical ZIP path", unsafePart: "Unsafe ZIP path component",
  attrs: "Symlink/special file or inconsistent directory attributes", extra: "Unsupported path/link/ZIP64 extra field",
  flags: "Unsupported flags/compression/encryption", split: "Truncated, split or ZIP64 record",
};

// --- image: size and type gate (checked before any byte is read)
IMG("image-empty", "png", "logo.png", "image/png", M.required, "0-byte file", () => new Uint8Array());
IMG("image-empty-wrong-type", "svg", "logo.svg", "image/svg+xml", M.required, "Size is checked before type: an empty SVG still gets FILE_REQUIRED", () => new Uint8Array());
IMG("image-svg", "svg", "logo.svg", "image/svg+xml", M.type, "SVG is not allowlisted", () => enc.encode(SVG));
IMG("image-svg-claiming-png-mime", "svg", "logo.svg", "image/png", M.type, "Extension svg not allowlisted even with an image/png MIME", () => enc.encode(SVG));
IMG("image-gif", "gif", "logo.gif", "image/gif", M.type, "GIF is not allowlisted", () => GIF);
IMG("image-ext-mime-mismatch", "png", "logo.jpg", "image/png", M.type, "Valid PNG bytes; .jpg extension with image/png MIME", null, { reuse: "png-rgba-8bit" });
IMG("image-mime-ext-mismatch", "png", "logo.png", "image/jpeg", M.type, "Valid PNG bytes; .png extension with image/jpeg MIME", null, { reuse: "png-rgba-8bit" });
IMG("image-no-extension", "png", "logo", "image/png", M.type, "Filename without an extension", null, { reuse: "png-rgba-8bit" });
IMG("image-empty-mime", "png", "logo.png", "", M.type, "Browser supplied no MIME type", null, { reuse: "png-rgba-8bit" });
IMG("image-nonstandard-jpg-mime", "jpg", "logo.jpg", "image/jpg", M.type, "image/jpg is not the registered JPEG MIME", null, { reuse: "jpeg-baseline" });
IMG("image-webp-with-png-mime", "webp", "logo.webp", "image/png", M.type, "WebP bytes, .webp extension, image/png MIME", null, { reuse: "webp-vp8-lossy" });
IMG("image-double-extension-last-svg", "png", "logo.png.svg", "image/png", M.type, "Only the last extension counts", null, { reuse: "png-rgba-8bit" });
IMG("image-double-extension-last-png", "png", "logo.svg.png", "image/png", null, "Only the last extension counts", null, { reuse: "png-rgba-8bit" });
IMG("image-uppercase-extension", "png", "LOGO.PNG", "image/png", null, "Extension compare is case-insensitive", null, { reuse: "png-rgba-8bit" });
IMG("image-jpeg-extension", "jpg", "logo.jpeg", "image/jpeg", null, ".jpeg is accepted (stored as jpg)", null, { reuse: "jpeg-baseline" });
IMG("image-exactly-10mib", "png", "logo.png", "image/png", null, "Valid PNG of exactly 10,485,760 bytes (tEXt padding): the size limit is inclusive", () => pngPadded(10 * MIB), { generated: true });
IMG("image-10mib-plus-1", "png", "logo.png", "image/png", M.tooLarge, "Valid PNG of 10,485,761 bytes", () => pngPadded(10 * MIB + 1), { generated: true });
IMG("image-10mib-plus-1-wrong-type", "png", "logo.svg", "image/svg+xml", M.tooLarge, "Size is checked before type", null, { reuse: "image-10mib-plus-1", generated: true });

// --- PNG
PNG("png-rgba-8bit", null, "8×8 RGBA, 8-bit", () => pngRgba());
PNG("png-palette", null, "8×8 palette (colour type 3, 2-bit) with PLTE and tRNS", () => png(IHDR(8, 8, 2, 3), chunk("PLTE", PALETTE), chunk("tRNS", Uint8Array.of(0, 255, 255, 128)), IDAT(8, 8, 2, 3), IEND()));
PNG("png-grayscale-1bit", null, "8×8 greyscale, 1-bit", () => png(IHDR(8, 8, 1, 0), IDAT(8, 8, 1, 0), IEND()));
PNG("png-gray-alpha-8bit", null, "4×4 greyscale+alpha, 8-bit", () => png(IHDR(4, 4, 8, 4), IDAT(4, 4, 8, 4), IEND()));
PNG("png-rgb-16bit", null, "4×4 RGB, 16-bit", () => png(IHDR(4, 4, 16, 2), IDAT(4, 4, 16, 2), IEND()));
PNG("png-interlaced", null, "1×1 RGBA, Adam7 interlace flag 1", () => png(IHDR(1, 1, 8, 6, 0, 0, 1), IDAT(1, 1), IEND()));
PNG("png-ancillary-chunks", null, "gAMA, pHYs, tEXt, a private ancillary chunk, and tEXt after IDAT", () => png(IHDR(8, 8), chunk("gAMA", u32be(45455)), chunk("pHYs", concat(u32be(2835), u32be(2835), 1)), chunk("tEXt", enc.encode("Title\0Logo")), chunk("vpAg", new Uint8Array(9)), IDAT(8, 8), chunk("tEXt", enc.encode("Author\0Studio")), IEND()));
PNG("png-multiple-idat", null, "One zlib stream split across three contiguous IDAT chunks", () => { const z = zlibWrap(scanlines(8, 8, 8, 6)); return png(IHDR(8, 8), chunk("IDAT", z.subarray(0, 10)), chunk("IDAT", z.subarray(10, 20)), chunk("IDAT", z.subarray(20)), IEND()); });
PNG("png-rgb-suggested-palette", null, "Truecolour with an optional suggested PLTE", () => png(IHDR(4, 4, 8, 2), chunk("PLTE", PALETTE), IDAT(4, 4, 8, 2), IEND()));
PNG("png-40mp-exact", null, "Header-only: IHDR 8000×5000 = exactly 40,000,000 px (limit is inclusive); IDAT is not a full image", () => pngHeaderOnly(8000, 5000));
PNG("png-40mp-plus", M.pixels, "Header-only: IHDR 8000×5001 = 40,008,000 px", () => pngHeaderOnly(8000, 5001));
PNG("png-huge-dimensions", M.pixels, "Header-only: IHDR 2147483647×2147483647", () => pngHeaderOnly(0x7fffffff, 0x7fffffff));
PNG("png-zero-width", M.dims, "IHDR width 0", () => pngHeaderOnly(0, 8));
PNG("png-signature-mismatch", "File is not a valid PNG", "JPEG bytes uploaded as logo.png / image/png", () => JPEG);
PNG("png-too-short", "File is not a valid PNG", "First 32 bytes of a valid PNG (needs ≥ 33)", () => pngRgba().slice(0, 32));
PNG("png-ihdr-not-first", "PNG is missing its IHDR header", "tEXt chunk before IHDR", () => png(chunk("tEXt", enc.encode("a\0b")), IHDR(8, 8), IDAT(8, 8), IEND()));
PNG("png-ihdr-bad-length", "PNG is missing its IHDR header", "IHDR with length 14", () => png(chunk("IHDR", concat(ihdrData(8, 8), 0)), IDAT(8, 8), IEND()));
PNG("png-bad-bit-depth", "PNG has an unsupported or malformed IHDR header", "Bit depth 3", () => png(IHDR(8, 8, 3, 0), IDAT(8, 8, 1, 0), IEND()));
PNG("png-bad-colour-type", "PNG has an unsupported or malformed IHDR header", "Colour type 5", () => png(IHDR(8, 8, 8, 5), IDAT(8, 8), IEND()));
PNG("png-bad-compression", "PNG has an unsupported or malformed IHDR header", "Compression method 1", () => png(IHDR(8, 8, 8, 6, 1), IDAT(8, 8), IEND()));
PNG("png-bad-filter", "PNG has an unsupported or malformed IHDR header", "Filter method 1", () => png(IHDR(8, 8, 8, 6, 0, 1), IDAT(8, 8), IEND()));
PNG("png-bad-interlace", "PNG has an unsupported or malformed IHDR header", "Interlace method 2", () => png(IHDR(8, 8, 8, 6, 0, 0, 2), IDAT(8, 8), IEND()));
PNG("png-bad-depth-combo", "Invalid PNG colour/bit-depth combination", "Truecolour (2) with bit depth 4", () => png(IHDR(8, 8, 4, 2), IDAT(8, 8, 4, 2), IEND()));
PNG("png-palette-16bit", "Invalid PNG colour/bit-depth combination", "Palette (3) with bit depth 16", () => png(IHDR(8, 8, 16, 3), chunk("PLTE", PALETTE), IDAT(8, 8, 8, 0), IEND()));
PNG("png-chunk-truncated", "PNG chunk is truncated", "IDAT length 1000 runs past the end of the file", () => { const id = IDAT(8, 8); return png(IHDR(8, 8), patch(id, 0, u32be(1000))); });
PNG("png-bad-crc", "PNG chunk CRC mismatch", "One IDAT data byte flipped (CRC no longer matches)", () => { const id = IDAT(8, 8); id[10] ^= 1; return png(IHDR(8, 8), id, IEND()); });
PNG("png-bad-crc-ancillary", "PNG chunk CRC mismatch", "Bad CRC on an ancillary tEXt chunk (still rejected)", () => png(IHDR(8, 8), chunk("tEXt", enc.encode("a\0b"), { crcXor: 1 }), IDAT(8, 8), IEND()));
PNG("png-apng", "Animated PNG is not supported", "APNG: acTL + fcTL before IDAT", () => png(IHDR(8, 8), chunk("acTL", concat(u32be(1), u32be(0))), chunk("fcTL", concat(u32be(0), u32be(8), u32be(8), u32be(0), u32be(0), u16be(1), u16be(10), 0, 0)), IDAT(8, 8), IEND()));
PNG("png-apng-fctl-only", "Animated PNG is not supported", "fcTL without acTL", () => png(IHDR(8, 8), chunk("fcTL", new Uint8Array(26)), IDAT(8, 8), IEND()));
PNG("png-apng-fdat-only", "Animated PNG is not supported", "fdAT after IDAT", () => png(IHDR(8, 8), IDAT(8, 8), chunk("fdAT", concat(u32be(1), zlibWrap(scanlines(8, 8, 8, 6)))), IEND()));
PNG("png-duplicate-ihdr", "Duplicate PNG header", "Second IHDR after the first", () => png(IHDR(8, 8), IHDR(8, 8), IDAT(8, 8), IEND()));
PNG("png-plte-duplicate", "Invalid PNG palette", "Two PLTE chunks", () => png(IHDR(8, 8, 2, 3), chunk("PLTE", PALETTE), chunk("PLTE", PALETTE), IDAT(8, 8, 2, 3), IEND()));
PNG("png-plte-after-idat", "Invalid PNG palette", "PLTE after IDAT (truecolour, so IDAT itself is allowed first)", () => png(IHDR(4, 4, 8, 2), IDAT(4, 4, 8, 2), chunk("PLTE", PALETTE), IEND()));
PNG("png-plte-empty", "Invalid PNG palette", "Zero-length PLTE", () => png(IHDR(8, 8, 2, 3), chunk("PLTE"), IDAT(8, 8, 2, 3), IEND()));
PNG("png-plte-not-multiple-of-3", "Invalid PNG palette", "PLTE of 4 bytes", () => png(IHDR(8, 8, 2, 3), chunk("PLTE", PALETTE.subarray(0, 4)), IDAT(8, 8, 2, 3), IEND()));
PNG("png-plte-too-long", "Invalid PNG palette", "PLTE of 771 bytes (257 entries)", () => png(IHDR(8, 8, 8, 3), chunk("PLTE", new Uint8Array(771)), IDAT(8, 8, 8, 3), IEND()));
PNG("png-plte-in-grayscale", "Invalid PNG palette", "PLTE in a greyscale (0) image", () => png(IHDR(8, 8, 8, 0), chunk("PLTE", PALETTE), IDAT(8, 8, 8, 0), IEND()));
PNG("png-plte-in-gray-alpha", "Invalid PNG palette", "PLTE in a greyscale+alpha (4) image", () => png(IHDR(4, 4, 8, 4), chunk("PLTE", PALETTE), IDAT(4, 4, 8, 4), IEND()));
PNG("png-palette-missing-plte", "Invalid PNG data order", "Palette image without PLTE", () => png(IHDR(8, 8, 2, 3), IDAT(8, 8, 2, 3), IEND()));
PNG("png-idat-not-contiguous", "Invalid PNG data order", "IDAT, tEXt, IDAT", () => { const z = zlibWrap(scanlines(8, 8, 8, 6)); return png(IHDR(8, 8), chunk("IDAT", z.subarray(0, 20)), chunk("tEXt", enc.encode("a\0b")), chunk("IDAT", z.subarray(20)), IEND()); });
PNG("png-unknown-critical-chunk", "Unsupported critical PNG chunk", "Unknown critical chunk CRIT", () => png(IHDR(8, 8), chunk("CRIT", Uint8Array.of(1)), IDAT(8, 8), IEND()));
PNG("png-invalid-chunk-name", "Unsupported critical PNG chunk", "Chunk type with a digit (ab1d)", () => png(IHDR(8, 8), chunk("ab1d", Uint8Array.of(1)), IDAT(8, 8), IEND()));
PNG("png-iend-with-data", "PNG is truncated or missing its end chunk", "IEND with 4 data bytes", () => png(IHDR(8, 8), IDAT(8, 8), chunk("IEND", Uint8Array.of(0, 0, 0, 0))));
PNG("png-no-idat", "PNG is truncated or missing its end chunk", "IHDR then IEND, no image data", () => png(IHDR(8, 8), IEND()));
PNG("png-empty-idat-only", "PNG is truncated or missing its end chunk", "Only a zero-length IDAT", () => png(IHDR(8, 8), chunk("IDAT"), IEND()));
PNG("png-trailing-bytes", "PNG is truncated or missing its end chunk", "4 bytes after IEND", () => concat(pngRgba(), "junk"));
PNG("png-missing-iend", "PNG is truncated or missing its end chunk", "File ends after IDAT", () => png(IHDR(8, 8), IDAT(8, 8)));
PNG("png-truncated-iend", "PNG is truncated or missing its end chunk", "Last 4 bytes (IEND CRC) cut off", () => pngRgba().slice(0, -4));

// --- JPEG
JPG("jpeg-baseline", null, "8×8 baseline (SOF0) encoded by libjpeg-turbo", () => JPEG);
JPG("jpeg-progressive", null, "8×8 progressive (SOF2), 10 scans", () => JPEG_PROGRESSIVE);
JPG("jpeg-extended-sof1", null, "Baseline data relabelled SOF1 (extended sequential)", () => patch(JPEG, jpegMarkerOffset(JPEG, 0xc0) + 1, [0xc1]));
JPG("jpeg-app-segments-fill-tem", null, "TEM marker, APP0 JFIF, APP1, COM and 0xFF fill bytes before markers", () => insertBefore(JPEG, 2, concat(0xff, 0x01, seg(0xe0, concat("JFIF\0", 1, 1, 0, u16be(1), u16be(1), 0, 0)), seg(0xe1, enc.encode("Exif\0\0")), 0xff, 0xff, seg(0xfe, enc.encode("Logo Fountain")))));
JPG("jpeg-stuffing-and-restarts", null, "Structure-only: scan data with FF00 stuffing and RST0/RST1 markers", () => jpegMin({ scan: [0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56, 0xff, 0xd1, 0x78] }));
JPG("jpeg-40mp-exact", null, "Header-only: baseline with SOF dimensions 8000×5000", () => jpegWithSofDims(JPEG, 8000, 5000));
JPG("jpeg-40mp-plus", M.pixels, "Header-only: SOF 8000×5001", () => jpegWithSofDims(JPEG, 8000, 5001));
JPG("jpeg-max-dimensions", M.pixels, "Header-only: SOF 65535×65535", () => jpegWithSofDims(JPEG, 65535, 65535));
JPG("jpeg-zero-height", M.dims, "SOF height 0 (would need DNL)", () => jpegWithSofDims(JPEG, 8, 0));
JPG("jpeg-signature-mismatch", "Not a JPEG", "PNG bytes uploaded as logo.jpg / image/jpeg", () => pngRgba());
JPG("jpeg-too-short", "Not a JPEG", "3 bytes: FF D8 FF", () => Uint8Array.of(0xff, 0xd8, 0xff));
JPG("jpeg-bad-marker-prefix", "Malformed JPEG marker", "Byte after SOI is 0x00, not 0xFF", () => concat(SOI, 0x00, JPEG.subarray(3)));
JPG("jpeg-soi-eoi-only", "Incomplete JPEG", "SOI immediately followed by EOI", () => concat(SOI, EOI));
JPG("jpeg-no-scan", "Incomplete JPEG", "SOI, SOF0, EOI (no SOS)", () => concat(SOI, seg(0xc0, sofPayload(8, 8)), EOI));
JPG("jpeg-trailing-bytes", "Incomplete JPEG", "2 bytes after EOI", () => concat(JPEG, 0x00, 0x00));
JPG("jpeg-marker-ff00", "Unexpected JPEG marker", "FF 00 outside entropy data", () => concat(SOI, 0xff, 0x00, JPEG.subarray(2)));
JPG("jpeg-second-soi", "Unexpected JPEG marker", "SOI twice", () => concat(SOI, JPEG));
JPG("jpeg-rst-outside-scan", "Unexpected JPEG marker", "RST0 before the frame", () => concat(SOI, 0xff, 0xd0, JPEG.subarray(2)));
JPG("jpeg-ends-in-fill", "Unexpected JPEG marker", "File ends with FF fill bytes where a marker is expected", () => concat(SOI, seg(0xfe, enc.encode("x")), 0xff, 0xff));
JPG("jpeg-truncated-segment-length", "Truncated JPEG segment", "File ends right after a marker, before its length", () => concat(SOI, 0xff, 0xc0));
JPG("jpeg-segment-length-too-small", "Invalid JPEG segment size", "COM segment length 1", () => concat(SOI, 0xff, 0xfe, 0x00, 0x01, JPEG.subarray(2)));
JPG("jpeg-segment-overruns-file", "Invalid JPEG segment size", "Baseline cut inside its first DQT segment", () => JPEG.slice(0, 40));
JPG("jpeg-lossless-sof3", "Unsupported or duplicate JPEG frame", "Frame marker SOF3 (lossless)", () => patch(JPEG, jpegMarkerOffset(JPEG, 0xc0) + 1, [0xc3]));
JPG("jpeg-arithmetic-sof9", "Unsupported or duplicate JPEG frame", "Frame marker SOF9 (arithmetic)", () => patch(JPEG, jpegMarkerOffset(JPEG, 0xc0) + 1, [0xc9]));
JPG("jpeg-two-frames", "Unsupported or duplicate JPEG frame", "A second SOF0 before SOS", () => { const o = jpegMarkerOffset(JPEG, 0xda); return insertBefore(JPEG, o, seg(0xc0, sofPayload(8, 8, 3))); });
JPG("jpeg-frame-after-scan", "Unsupported or duplicate JPEG frame", "Structure-only: SOF0 again after the first scan", () => jpegMin({ after: seg(0xc0, sofPayload(8, 8)) }));
JPG("jpeg-zero-components", "Unsupported or duplicate JPEG frame", "SOF with 0 components", () => jpegMin({ n: 0 }));
JPG("jpeg-five-components", "Unsupported or duplicate JPEG frame", "SOF with 5 components", () => jpegMin({ n: 5 }));
JPG("jpeg-sof-length-mismatch", "Unsupported or duplicate JPEG frame", "SOF declares 3 components but carries 2", () => concat(SOI, seg(0xc0, sofPayload(8, 8, 3, { length: 2 })), seg(0xda, sosPayload(1)), 0x12, EOI));
JPG("jpeg-sof-too-short", "Unsupported or duplicate JPEG frame", "SOF0 segment of length 6 (under 8)", () => concat(SOI, seg(0xc0, Uint8Array.of(8, 0, 8, 0)), seg(0xda, sosPayload(1)), 0x12, EOI));
JPG("jpeg-sos-too-short", "Invalid JPEG scan", "SOS segment of length 4 (under 6)", () => concat(SOI, seg(0xc0, sofPayload(8, 8)), seg(0xda, Uint8Array.of(1, 1)), 0x12, EOI));
JPG("jpeg-dnl", "JPEG deferred dimensions unsupported", "DNL segment after the scan", () => insertBefore(JPEG, JPEG.length - 2, seg(0xdc, u16be(8))));
JPG("jpeg-sos-before-frame", "Invalid JPEG scan", "SOS with no preceding frame", () => concat(SOI, seg(0xda, sosPayload(1)), 0x12, EOI));
JPG("jpeg-sos-zero-components", "Invalid JPEG scan", "SOS with 0 components", () => concat(SOI, seg(0xc0, sofPayload(8, 8)), seg(0xda, concat(0, 0, 0x3f, 0)), 0x12, EOI));
JPG("jpeg-sos-length-mismatch", "Invalid JPEG scan", "SOS declares 2 components, carries 1", () => concat(SOI, seg(0xc0, sofPayload(8, 8)), seg(0xda, concat(2, 1, 0, 0, 0x3f, 0)), 0x12, EOI));
JPG("jpeg-empty-scan", "Empty JPEG scan", "SOS immediately followed by EOI", () => jpegMin({ scan: [] }));
JPG("jpeg-missing-eoi", "Missing JPEG end marker", "Baseline with the EOI cut off", () => JPEG.slice(0, -2));

// --- WebP
WEBP("webp-vp8-lossy", null, "8×8 simple lossy (VP8)", () => b64(SEED.webpLossy));
WEBP("webp-vp8l-lossless", null, "8×8 simple lossless (VP8L)", () => b64(SEED.webpLossless));
WEBP("webp-vp8x-alpha", null, "8×8 extended: VP8X (alpha flag) + ALPH + VP8", () => b64(SEED.webpLossyAlpha));
WEBP("webp-vp8x-metadata", null, "Structure-only metadata: VP8X (ICC/EXIF/XMP flags) + ICCP + VP8L + odd-size EXIF (padded) + XMP", () => webp(VP8X(0x2c, 8, 8), webpChunk("ICCP", enc.encode("not-a-real-profile")), VP8L(), webpChunk("EXIF", enc.encode("Exif\0\0x")), webpChunk("XMP ", enc.encode("<x:xmpmeta/>"))));
WEBP("webp-40mp-exact", null, "Header-only: VP8L 8000×5000 = exactly 40,000,000 px", () => webp(VP8L(vp8lWithDims(8000, 5000))));
WEBP("webp-vp8l-over-40mp", M.pixels, "Header-only: VP8L 16384×16384", () => webp(VP8L(vp8lWithDims(16384, 16384))));
WEBP("webp-vp8-over-40mp", M.pixels, "Header-only: VP8 16383×16383", () => webp(VP8(vp8WithDims(16383, 16383))));
WEBP("webp-vp8x-canvas-over-40mp", M.pixels, "Header-only: VP8X canvas 8000×5001", () => webp(VP8X(0x10, 8000, 5001), webpChunk("ALPH", ALPH_DATA), VP8(VP8_ALPHA_DATA)));
WEBP("webp-vp8-zero-width", M.dims, "VP8 width 0", () => webp(VP8(vp8WithDims(0, 8))));
WEBP("webp-signature-mismatch", "Not WebP", "RIFF/WAVE container", () => concat("RIFF", u32le(28), "WAVE", "fmt ", u32le(16), new Uint8Array(16)));
WEBP("webp-rifx", "Not WebP", "Big-endian RIFX magic instead of RIFF", () => patch(b64(SEED.webpLossless), 3, [0x58]));
WEBP("webp-too-short", "Not WebP", "19 bytes", () => b64(SEED.webpLossless).slice(0, 19));
WEBP("webp-riff-size-mismatch", "Invalid RIFF size", "RIFF size 2 larger than the file", () => riff(VP8L(), { sizeDelta: 2 }));
WEBP("webp-trailing-bytes", "Invalid RIFF size", "2 bytes after the image; RIFF size not updated", () => concat(b64(SEED.webpLossless), 0, 0));
WEBP("webp-trailing-bytes-in-riff", "Truncated WebP chunk", "2 bytes after the image, included in the RIFF size", () => riff(concat(VP8L(), Uint8Array.of(0, 0))));
WEBP("webp-chunk-size-overrun", "Invalid WebP chunk size", "VP8L chunk size runs past the end of the file", () => riff(webpChunk("VP8L", VP8L_DATA, { size: VP8L_DATA.length + 100 })));
WEBP("webp-animated", "Invalid/animated extended WebP", "VP8X animation flag + ANIM + ANMF", () => webp(VP8X(0x12, 8, 8), webpChunk("ANIM", new Uint8Array(6)), webpChunk("ANMF", concat(new Uint8Array(6), u32le(7).subarray(0, 3), u32le(7).subarray(0, 3), u32le(100).subarray(0, 3), 0, VP8L()))));
WEBP("webp-anim-chunk", "Animated WebP unsupported", "ANIM chunk without VP8X", () => webp(webpChunk("ANIM", new Uint8Array(6)), VP8L()));
WEBP("webp-anmf-chunk", "Animated WebP unsupported", "ANMF chunk after a static VP8X", () => webp(VP8X(0, 8, 8), webpChunk("ANMF", concat(new Uint8Array(15), 0, VP8L()))));
WEBP("webp-vp8x-not-first", "Invalid/animated extended WebP", "VP8L chunk then VP8X", () => webp(VP8L(), VP8X(0, 8, 8)));
WEBP("webp-vp8x-bad-size", "Invalid/animated extended WebP", "VP8X chunk of 12 bytes", () => webp(webpChunk("VP8X", concat(vp8xData(0, 8, 8), 0, 0)), VP8L()));
WEBP("webp-vp8x-reserved-flag-bits", "Invalid/animated extended WebP", "VP8X reserved flag bit 0 set", () => webp(VP8X(0x01, 8, 8), VP8L()));
WEBP("webp-vp8x-reserved-bytes", "Invalid/animated extended WebP", "VP8X reserved bytes non-zero", () => webp(VP8X(0, 8, 8, { reserved: [0, 1, 0] }), VP8L()));
WEBP("webp-multiple-payloads", "Multiple WebP image payloads", "Two VP8L chunks", () => webp(VP8L(), VP8L()));
WEBP("webp-vp8-and-vp8l", "Multiple WebP image payloads", "VP8 then VP8L", () => webp(VP8(), VP8L()));
WEBP("webp-vp8l-bad-signature", "Invalid VP8L header", "VP8L signature byte 0x2e", () => webp(VP8L(patch(VP8L_DATA, 0, [0x2e]))));
WEBP("webp-vp8l-bad-version", "Invalid VP8L header", "VP8L version bits non-zero", () => webp(VP8L(patch(VP8L_DATA, 4, [VP8L_DATA[4] | 0x20]))));
WEBP("webp-vp8l-too-short", "Invalid VP8L header", "VP8L chunk of 5 bytes", () => webp(VP8L(VP8L_DATA.slice(0, 5))));
WEBP("webp-vp8-not-keyframe", "Invalid VP8 keyframe", "VP8 frame tag marks an interframe", () => webp(VP8(patch(VP8_DATA, 0, [VP8_DATA[0] | 1]))));
WEBP("webp-vp8-bad-start-code", "Invalid VP8 keyframe", "VP8 start code 9d 01 2b", () => webp(VP8(patch(VP8_DATA, 5, [0x2b]))));
WEBP("webp-vp8-too-short", "Invalid VP8 keyframe", "VP8 chunk of 10 bytes", () => webp(VP8(VP8_DATA.slice(0, 10))));
WEBP("webp-canvas-mismatch", "WebP canvas/image mismatch", "VP8X canvas 9×8, VP8 payload 8×8", () => webp(VP8X(0x10, 9, 8), webpChunk("ALPH", ALPH_DATA), VP8(VP8_ALPHA_DATA)));
WEBP("webp-unsupported-chunk", "Unsupported WebP chunk", "JUNK chunk after VP8L", () => webp(VP8L(), webpChunk("JUNK", new Uint8Array(4))));
WEBP("webp-vp8x-without-payload", "Missing WebP image payload", "VP8X + ALPH, no VP8/VP8L", () => webp(VP8X(0x10, 8, 8), webpChunk("ALPH", ALPH_DATA)));
WEBP("webp-metadata-only", "Missing WebP image payload", "Only an EXIF chunk", () => webp(webpChunk("EXIF", enc.encode("Exif\0\0"))));

// --- ZIP: size, type and signature gate
ZIP("zip-empty", "final.zip", "application/zip", M.zipRequired, "0-byte file", () => new Uint8Array());
ZIP("zip-wrong-extension", "final.png", "application/zip", M.zipType, "Valid ZIP named .png", null, { reuse: "zip-stored-single" });
ZIP("zip-no-extension", "final", "application/zip", M.zipType, "Valid ZIP without an extension", null, { reuse: "zip-stored-single" });
ZIP("zip-text-mime", "final.zip", "text/plain", M.zipType, "MIME text/plain", null, { reuse: "zip-stored-single" });
ZIP("zip-octet-stream-mime", "final.zip", "application/octet-stream", M.zipType, "MIME application/octet-stream is not allowed", null, { reuse: "zip-stored-single" });
ZIP("zip-x-zip-mime", "final.zip", "application/x-zip", M.zipType, "MIME application/x-zip is not allowed", null, { reuse: "zip-stored-single" });
ZIP("zip-empty-mime", "final.zip", "", M.zipType, "No MIME", null, { reuse: "zip-stored-single" });
ZIP("zip-mime-alias-uppercase-ext", "Final.ZIP", "application/x-zip-compressed", null, "Windows MIME alias and an uppercase extension", null, { reuse: "zip-stored-single" });
Z("zip-signature-eocd-only", M.zipSig, "Empty archive: only an EOCD (PK\\5\\6)", () => zip([], {}));
Z("zip-signature-too-short", M.zipSig, "3 bytes: PK\\3", () => Uint8Array.of(0x50, 0x4b, 0x03));
Z("zip-signature-sfx-stub", M.zipSig, "Self-extracting style: MZ stub before a valid ZIP", () => concat("MZ", new Uint8Array(62), basicZip()));
Z("zip-signature-rar", M.zipSig, "RAR 5 signature", () => concat(Uint8Array.of(0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00), new Uint8Array(32)));
Z("zip-signature-png", M.zipSig, "PNG bytes named final.zip", () => pngRgba());
Z("zip-95000000", null, "Valid stored ZIP of exactly 95,000,000 bytes", () => zipOfSize(95_000_000), { generated: true });
Z("zip-95000001", null, "Valid stored ZIP of 95,000,001 bytes: under Next's 100 MiB, over Laravel's 95,000,000 (DV-13)", () => zipOfSize(95_000_001), { generated: true, laravelExpectedCode: "FILE_TOO_LARGE" });
Z("zip-100mib-exact", null, "Valid stored ZIP of exactly 104,857,600 bytes (Next limit inclusive)", () => zipOfSize(100 * MIB), { generated: true, laravelExpectedCode: "FILE_TOO_LARGE" });
Z("zip-100mib-plus-1", M.zipTooLarge, "Valid stored ZIP of 104,857,601 bytes", () => zipOfSize(100 * MIB + 1), { generated: true });

// --- ZIP: valid archives
Z("zip-stored-single", null, "One stored entry", () => zip([{ name: "logo.svg", data: SVG }]));
Z("zip-deflate-tree", null, "Directory entries plus stored and deflated files", () => zip([{ name: "Logo Fountain/" }, { name: "Logo Fountain/logo.svg", data: SVG, method: 8 }, { name: "Logo Fountain/logo.png", data: pngRgba() }, { name: "Logo Fountain/source/" }, { name: "Logo Fountain/source/README.txt", data: README, method: 8 }]));
Z("zip-descriptor-signed", null, "Deflate with a signed data descriptor (local CRC/sizes zero)", () => basicZip("logo.svg", { descriptor: "signed" }));
Z("zip-descriptor-unsigned", null, "Deflate with an unsigned data descriptor", () => basicZip("logo.svg", { descriptor: "unsigned" }));
Z("zip-descriptor-stored", null, "Stored entry with a signed data descriptor", () => zip([{ name: "logo.svg", data: SVG, descriptor: "signed" }]));
Z("zip-descriptor-local-fields-set", null, "Descriptor flag with the real CRC/sizes also in the local header", () => basicZip("logo.svg", { descriptor: "signed", localFields: true }));
Z("zip-descriptor-crc-equals-signature", null, "Unsigned descriptor whose CRC is 0x08074b50 (the optional signature value)", () => zip([{ name: "logo.txt", data: forceCrc(enc.encode("logo-"), 0x08074b50), descriptor: "unsigned" }]));
Z("zip-cp437-names", null, "Names without the UTF-8 flag, decoded as CP437 (0x82 é, 0x81 ü)", () => zip([{ name: Uint8Array.of(0x43, 0x61, 0x66, 0x82, 0x2e, 0x74, 0x78, 0x74), data: "cafe" }, { name: Uint8Array.of(0x81, 0x62, 0x65, 0x72, 0x2f) }]));
Z("zip-utf8-names", null, "UTF-8 flag with accented and CJK names", () => zip([{ name: "café/", utf8: true }, { name: "café/ロゴ.svg", data: SVG, utf8: true, method: 8 }]));
Z("zip-reserved-lookalikes", null, "Names that only resemble reserved Windows names: console.txt, con-logo.txt, com0.txt, lpt10.txt, nul_.txt", () => zip(["console.txt", "con-logo.txt", "com0.txt", "lpt10.txt", "nul_.txt"].map((name) => ({ name, data: "x" }))));
Z("zip-comment", null, "EOCD with a 13-byte comment", () => zip([{ name: "logo.svg", data: SVG }], { comment: "Logo Fountain" }));
Z("zip-max-comment", null, "EOCD with a 65,535-byte comment (EOCD at the edge of the search window)", () => zip([{ name: "logo.svg", data: SVG }], { comment: repeat(0x20, 65535) }));
Z("zip-allowed-extras", null, "Extended-timestamp (0x5455) and Unix uid/gid (0x7875) extras", () => zip([{ name: "logo.svg", data: SVG, extra: concat(extraField(0x5455, concat(1, u32le(1700000000))), extraField(0x7875, concat(1, 4, u32le(1000), 4, u32le(1000)))) }]));
Z("zip-dos-attributes", null, "Made by MS-DOS: archive bit on a file, directory bit on a directory", () => zip([{ name: "art/", madeBy: 0x0014, attr: 0x10 }, { name: "art/logo.svg", data: SVG, madeBy: 0x0014, attr: 0x20 }]));
Z("zip-1000-entries", null, "Exactly 1000 empty entries (limit inclusive)", () => manyEntries(1000));
Z("zip-ratio-exactly-100", null, "Deflate entry with uncompressed = 100 × compressed exactly (limit inclusive)", () => { const { data, payload } = ratioEntry(100); return zip([{ name: "art.bin", method: 8, data, payload }]); });

// --- ZIP: structure
Z("zip-shorter-than-eocd", "Not a nonempty standard ZIP", "PK\\3\\4 followed by 10 bytes (under 22)", () => concat(u32le(0x04034b50), new Uint8Array(10)));
Z("zip-truncated-last-byte", "Missing end directory", "Valid ZIP with its last byte removed", () => basicZip().slice(0, -1));
Z("zip-no-eocd", "Missing end directory", "End-of-central-directory record removed", () => basicZip().slice(0, -22));
Z("zip-trailing-data", "Missing end directory", "4 bytes after the EOCD", () => concat(basicZip(), "junk"));
Z("zip-comment-length-overrun", "Missing end directory", "EOCD comment length 10, only 4 bytes present", () => zip([{ name: "logo.svg", data: SVG }], { comment: "abcd", eocd: { commentLength: 10 } }));
Z("zip-fake-eocd-in-comment", "Multivolume/empty ZIP unsupported", "The comment ends with a 22-byte fake EOCD (0 entries), which the backwards scan finds first", () => zip([{ name: "logo.svg", data: SVG }], { comment: concat(u32le(0x06054b50), new Uint8Array(18)) }));
Z("zip-multidisk", "Multivolume/empty ZIP unsupported", "EOCD disk number 1", () => zip([{ name: "logo.svg", data: SVG }], { eocd: { disk: 1 } }));
Z("zip-central-on-other-disk", "Multivolume/empty ZIP unsupported", "EOCD central-directory disk 1", () => zip([{ name: "logo.svg", data: SVG }], { eocd: { cdDisk: 1 } }));
Z("zip-count-mismatch", "Multivolume/empty ZIP unsupported", "Entries-on-this-disk 1, total 2", () => zip([{ name: "logo.svg", data: SVG }], { eocd: { count: 2 } }));
Z("zip-zero-entries", "Multivolume/empty ZIP unsupported", "A local record but EOCD entry count 0", () => zip([{ name: "logo.svg", data: SVG }], { eocd: { count: 0, countDisk: 0 } }));
Z("zip-1001-entries", M.zipLimit, "1001 empty entries", () => manyEntries(1001));
Z("zip-directory-bounds", "Invalid directory bounds", "Central directory size off by one", () => zip([{ name: "logo.svg", data: SVG, method: 8 }], { eocd: { cdSize: 46 + 8 + 1 } }));
Z("zip64-end-records", "Invalid directory bounds", "ZIP64 end record + locator between the central directory and the EOCD", () => zip([{ name: "logo.svg", data: SVG }], { beforeEocd: zip64Eocd }));
Z("zip-count-exceeds-records", "Invalid central record", "EOCD counts 2 entries; the central directory holds 1", () => zip([{ name: "logo.svg", data: SVG }], { eocd: { count: 2, countDisk: 2 } }));
Z("zip-bad-central-signature", "Invalid central record", "Central record signature corrupted (first byte 0x51)", () => patchCentral(zip([{ name: "logo.svg", data: SVG }]), 0, [0x51]));
Z("zip-central-name-overrun", M.split, "Central name length 40 runs into the EOCD", () => patchCentral(zip([{ name: "logo.svg", data: SVG }]), 28, u16le(40)));
Z("zip-split-disk-start", M.split, "Entry disk-number-start 1", () => zip([{ name: "logo.svg", data: SVG, disk: 1 }]));
Z("zip64-size-marker", M.split, "Compressed and uncompressed sizes 0xFFFFFFFF (ZIP64 placeholders)", () => zip([{ name: "logo.svg", data: SVG, csize: 0xffffffff, size: 0xffffffff, local: { csize: 0xffffffff, size: 0xffffffff } }]));
Z("zip64-offset-marker", M.split, "Local header offset 0xFFFFFFFF", () => zip([{ name: "logo.svg", data: SVG, offset: 0xffffffff }]));
Z("zip64-extra-field", M.extra, "ZIP64 extended-information extra (0x0001)", () => zip([{ name: "logo.svg", data: SVG, extra: extraField(0x0001, new Uint8Array(16)) }]));
Z("zip-encrypted", M.flags, "Traditional PKWARE encryption flag (bit 0)", () => zip([{ name: "logo.svg", data: SVG, flags: 1 }]));
Z("zip-strong-encryption", M.flags, "Strong encryption flag (bit 6)", () => zip([{ name: "logo.svg", data: SVG, flags: 0x41 }]));
Z("zip-unsupported-method-bzip2", M.flags, "Compression method 12 (bzip2)", () => zip([{ name: "logo.svg", data: SVG, method: 12 }]));
Z("zip-unsupported-method-aes", M.flags, "Compression method 99 (WinZip AES) with the encryption flag", () => zip([{ name: "logo.svg", data: SVG, method: 99, flags: 1 }]));
Z("zip-stored-with-deflate-option-flags", M.flags, "Stored entry with deflate option bits (flags 0x6)", () => zip([{ name: "logo.svg", data: SVG, flags: 6 }]));
Z("zip-unknown-flag-bit", M.flags, "General-purpose flag bit 4 (enhanced deflate) set", () => basicZip("logo.svg", { flags: 0x10 }));
Z("zip-invalid-utf8-name", "Invalid UTF-8 entry name", "UTF-8 flag with bytes C3 28", () => zip([{ name: Uint8Array.of(0x61, 0xc3, 0x28, 0x2e, 0x74, 0x78, 0x74), utf8: true, data: "x" }]));

// --- ZIP: names
const nameCase = (id, name, branch, note, more = {}) => Z(id, branch, note, () => zip([{ name, data: "x", ...more }]));
nameCase("zip-path-traversal", "../evil.txt", M.unsafePart, "Leading .. segment");
nameCase("zip-path-traversal-nested", "logos/../../evil.txt", M.unsafePart, "Nested .. segments");
nameCase("zip-absolute-path", "/etc/evil.txt", M.unsafePath, "Leading slash");
nameCase("zip-backslash", "..\\evil.txt", M.unsafePath, "Backslash separator");
nameCase("zip-drive-letter", "C:/evil.txt", M.unsafePath, "Colon (drive letter)");
nameCase("zip-control-character", "logo\x01.txt", M.unsafePath, "Control character 0x01");
nameCase("zip-empty-name", "", M.unsafePath, "Zero-length name");
nameCase("zip-dot-segment", "./logo.txt", M.unsafePart, "Leading . segment");
nameCase("zip-empty-segment", "logos//logo.txt", M.unsafePart, "Empty segment (double slash)");
nameCase("zip-trailing-dot", "logo.", M.unsafePart, "Segment ends with a dot");
nameCase("zip-trailing-space", "logos /logo.txt", M.unsafePart, "Directory segment ends with a space");
nameCase("zip-reserved-con", "CON", M.unsafePart, "Windows reserved name CON");
nameCase("zip-reserved-nul-ext", "nul.txt", M.unsafePart, "Windows reserved name NUL with an extension");
nameCase("zip-reserved-com1-nested", "art/COM1.png", M.unsafePart, "Windows reserved COM1 in a subdirectory");
nameCase("zip-reserved-lpt9", "lpt9", M.unsafePart, "Windows reserved LPT9");
nameCase("zip-non-nfkc-decomposed", "cafe\u0301.txt", M.unsafePath, "UTF-8 e + combining acute (not NFKC)", { utf8: true });
nameCase("zip-non-nfkc-fullwidth", "\uff45vil.txt", M.unsafePath, "UTF-8 fullwidth e (NFKC folds it)", { utf8: true });
nameCase("zip-non-nfkc-ligature", "\ufb01le.txt", M.unsafePath, "UTF-8 fi ligature", { utf8: true });
nameCase("zip-cp437-half", Uint8Array.of(0xab, 0x2e, 0x74, 0x78, 0x74), M.unsafePath, "CP437 0xAB decodes to ½, which NFKC changes");
nameCase("zip-cp437-nbsp", Uint8Array.of(0x61, 0xff, 0x62, 0x2e, 0x74, 0x78, 0x74), M.unsafePath, "CP437 0xFF decodes to NBSP, which NFKC changes");
Z("zip-case-collision", "Colliding ZIP names", "Logo.png and logo.PNG", () => zip([{ name: "Logo.png", data: "a" }, { name: "logo.PNG", data: "b" }]));
Z("zip-duplicate-name", "Colliding ZIP names", "The same name twice", () => zip([{ name: "logo.png", data: "a" }, { name: "logo.png", data: "b" }]));
Z("zip-file-dir-collision", "Colliding ZIP names", "File 'art' and directory 'art/'", () => zip([{ name: "art", data: "a" }, { name: "art/" }]));
Z("zip-file-as-ancestor", "File used as ancestor directory", "File 'art' and file 'art/logo.png'", () => zip([{ name: "art", data: "a" }, { name: "art/logo.png", data: "b" }]));
Z("zip-file-as-ancestor-casefold", "File used as ancestor directory", "File 'Art' and file 'art/sub/logo.png'", () => zip([{ name: "art/sub/logo.png", data: "b" }, { name: "Art", data: "a" }]));

// --- ZIP: attributes and extras
const attrCase = (id, attr, note, more = {}) => Z(id, M.attrs, note, () => zip([{ name: "logo.svg", data: SVG, attr, ...more }]));
attrCase("zip-symlink", (0o120777 << 16) >>> 0, "Unix symlink mode 0120777");
attrCase("zip-char-device", (0o20644 << 16) >>> 0, "Unix character device");
attrCase("zip-fifo", (0o10644 << 16) >>> 0, "Unix FIFO");
attrCase("zip-dos-volume-label", 0x08, "DOS volume-label attribute", { madeBy: 0x0014 });
attrCase("zip-unix-dir-mode-on-file", (0o40755 << 16) >>> 0, "Unix directory mode on a name without a trailing slash");
attrCase("zip-dos-dir-bit-on-file", 0x10, "DOS directory bit on a file", { madeBy: 0x0014 });
Z("zip-unix-file-mode-on-dir", M.attrs, "Unix regular-file mode on a name ending in /", () => zip([{ name: "art/", attr: FILE_ATTR }]));
Z("zip-extra-truncated", "Truncated extra field", "Extra header declares 9 bytes, 3 present", () => zip([{ name: "logo.svg", data: SVG, extra: concat(u16le(0x5455), u16le(9), 1, 0, 0) }]));
Z("zip-extra-short-header", "Truncated extra field", "2-byte extra field (shorter than an id+size header)", () => zip([{ name: "logo.svg", data: SVG, extra: u16le(0x5455) }]));
const extraCase = (id, fieldId, note) => Z(id, M.extra, note, () => zip([{ name: "logo.svg", data: SVG, extra: extraField(fieldId, concat(1, u32le(0), enc.encode("evil.svg"))) }]));
extraCase("zip-extra-unicode-path", 0x7075, "Info-ZIP Unicode path extra (0x7075)");
extraCase("zip-extra-unicode-comment", 0x6375, "Info-ZIP Unicode comment extra (0x6375)");
extraCase("zip-extra-pkware-unix", 0x000d, "PKWARE Unix extra (0x000d, can carry a link target)");
extraCase("zip-extra-asi-unix", 0x756e, "ASi Unix extra (0x756e, can carry a link target)");
Z("zip-local-extra-unicode-path", M.extra, "Unicode path extra in the local header only", () => zip([{ name: "logo.svg", data: SVG, localExtra: extraField(0x7075, concat(1, u32le(0), enc.encode("evil.svg"))) }]));

// --- ZIP: local headers and descriptors
Z("zip-local-offset-out-of-range", "Invalid local header", "Central record points past the central directory", () => zip([{ name: "logo.svg", data: SVG, offset: 0x7fffffff }]));
Z("zip-local-bad-signature", "Invalid local header", "Central record points 1 byte into the local header", () => zip([{ name: "logo.svg", data: SVG, offset: 1 }]));
Z("zip-local-flags-mismatch", "Local header mismatch", "Local flags 0x800, central 0", () => zip([{ name: "logo.svg", data: SVG, local: { flags: 0x800 } }]));
Z("zip-local-method-mismatch", "Local header mismatch", "Local method 8, central 0", () => zip([{ name: "logo.svg", data: SVG, local: { method: 8 } }]));
Z("zip-local-data-overrun", "Local header mismatch", "Compressed size 1 byte larger than the data before the central directory", () => zip([{ name: "logo.svg", data: SVG, csize: enc.encode(SVG).length + 1, local: { csize: enc.encode(SVG).length + 1 } }]));
Z("zip-local-name-unsafe", M.unsafePart, "Central 'logo.svg', local '../logo.svg'", () => zip([{ name: "logo.svg", data: SVG, local: { name: "../logo.svg" } }]));
Z("zip-local-name-mismatch", "Local and central names differ", "Central 'logo.svg', local 'logo.SVG'", () => zip([{ name: "logo.svg", data: SVG, local: { name: "logo.SVG" } }]));
Z("zip-descriptor-inconsistent-local", "Inconsistent local descriptor fields", "Descriptor flag, local CRC non-zero and wrong", () => basicZip("logo.svg", { descriptor: "signed", local: { crc: 1 } }));
Z("zip-descriptor-missing", "Invalid data descriptor", "Descriptor flag but no descriptor bytes", () => basicZip("logo.svg", { flags: 8, local: { crc: 0, csize: 0, size: 0 } }));
Z("zip-descriptor-wrong-crc", "Invalid data descriptor", "Signed descriptor whose CRC differs from the central record", () => basicZip("logo.svg", { descriptor: "signed", descriptorFields: { crc: 1, csize: deflateRaw(enc.encode(SVG)).length, size: enc.encode(SVG).length } }));
Z("zip-local-crc-mismatch", "Local size/CRC mismatch", "Local CRC differs from central (no descriptor)", () => zip([{ name: "logo.svg", data: SVG, local: { crc: 1 } }]));
Z("zip-local-size-mismatch", "Local size/CRC mismatch", "Local uncompressed size differs from central", () => basicZip("logo.svg", { local: { size: 1 } }));
Z("zip-stored-size-mismatch", "Stored size mismatch", "Stored entry with compressed 5, uncompressed 4", () => zip([{ name: "logo.txt", data: "logo!", size: 4 }]));
Z("zip-directory-with-payload", "Directory contains payload", "Directory entry 'art/' with 3 stored bytes", () => zip([{ name: "art/", data: "abc" }]));

// --- ZIP: limits
Z("zip-bomb-declared-ratio", M.zipLimit, "1 MiB of zeros deflated to ~6.6 KB, declared honestly (ratio ~159)", () => zip([{ name: "bomb.bin", method: 8, data: new Uint8Array(MIB) }]));
Z("zip-ratio-101", M.zipLimit, "As zip-ratio-exactly-100 but declared size 1 byte over 100 × compressed", () => { const { data, payload } = ratioEntry(100); return zip([{ name: "art.bin", method: 8, data, payload, size: data.length + 1 }]); });
Z("zip-declared-size-over-500mib", M.zipLimit, "Declared uncompressed size 600 MiB (also over the ratio)", () => zip([{ name: "big.bin", method: 8, data: "x", size: 600 * MIB }]));
Z("zip-bomb-lying-size", M.zipLimit, "Declares 1000 bytes; actually inflates to 1 MiB (actual size over declared)", () => zip([{ name: "bomb.bin", method: 8, data: new Uint8Array(MIB), size: 1000 }]));
Z("zip-total-expanded-over-500mib", M.zipLimit, "6 deflate entries of 100 MiB actual each (ratio ~96): total expanded passes 500 MiB", () => zipTotalOverLimit(), { generated: true });

// --- ZIP: record layout
Z("zip-directory-length-mismatch", "Directory length mismatch", "8 junk bytes at the end of the central directory, counted in its size", () => zip([{ name: "logo.svg", data: SVG }], { centralTail: new Uint8Array(8) }));
Z("zip-overlapping-records", "Overlapping or unreferenced local records", "Entry b's local record sits inside entry a's data", () => overlappingZip());
Z("zip-gap-between-records", "Overlapping or unreferenced local records", "4 junk bytes between two local records", () => zip([{ name: "a.txt", data: "a" }, { name: "b.txt", data: "b" }], { between: { 1: latin1("junk") } }));
Z("zip-unreferenced-leading-record", "Overlapping or unreferenced local records", "An orphan local record (not in the central directory) at offset 0", () => zip([{ name: "logo.svg", data: SVG }], { prefix: orphanLocal }));
Z("zip-data-before-directory", "Unexpected data before directory", "4 junk bytes between the last local record and the central directory", () => zip([{ name: "logo.svg", data: SVG }], { beforeCentral: latin1("junk") }));

// --- ZIP: payload
Z("zip-invalid-deflate", "Invalid or truncated deflate stream", "Deflate block type 3 (reserved)", () => zip([{ name: "logo.txt", method: 8, data: "logo", payload: Uint8Array.of(0x07, 0, 0, 0) }]));
Z("zip-truncated-deflate", "Invalid or truncated deflate stream", "Deflate stream with its last byte removed", () => zip([{ name: "readme.txt", method: 8, data: README, payload: deflateRaw(enc.encode(README)).slice(0, -1) }]));
Z("zip-trailing-compressed-data", "Trailing compressed data", "4 bytes after the end of the deflate stream, inside the compressed size", () => zip([{ name: "readme.txt", method: 8, data: README, payload: concat(deflateRaw(enc.encode(README)), new Uint8Array(4)) }]));
Z("zip-crc-mismatch", "Actual size/CRC mismatch", "Both headers carry a wrong CRC", () => basicZip("logo.svg", { crc: 1 }));
Z("zip-stored-crc-mismatch", "Actual size/CRC mismatch", "Stored entry, both headers carry a wrong CRC", () => zip([{ name: "logo.svg", data: SVG, crc: 1 }]));
Z("zip-actual-size-short", "Actual size/CRC mismatch", "Declared size 5 bytes larger than the inflated data", () => basicZip("logo.svg", { size: enc.encode(SVG).length + 5 }));

// ------------------------------------------------------------- manifest ----
const byId = new Map(cases.map((c) => [c.id, c]));
if (byId.size !== cases.length) throw new Error("duplicate case id");
const fileOf = (c) => {
  const src = c.reuse ? byId.get(c.reuse) : c;
  if (!src) throw new Error(`${c.id}: unknown reuse ${c.reuse}`);
  return `${src.generated ? ".generated" : src.kind}/${src.id}.${src.ext}`;
};
const buildOf = (c) => (c.reuse ? byId.get(c.reuse) : c).build();
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function readManifest() {
  if (!existsSync(MANIFEST)) return new Map();
  return new Map(JSON.parse(readFileSync(MANIFEST, "utf8")).cases.map((e) => [e.id, e]));
}
function entryFor(c, bytes, previous) {
  const e = {
    id: c.id, file: fileOf(c), kind: c.kind, filename: c.filename, mime: c.mime,
    expectedCode: previous && "expectedCode" in previous ? previous.expectedCode : undefined,
    branch: c.branch, generated: Boolean(c.generated || (c.reuse && byId.get(c.reuse).generated)),
    size: bytes.length, sha256: sha256(bytes), note: c.note,
  };
  if (c.laravelExpectedCode !== undefined) e.laravelExpectedCode = c.laravelExpectedCode;
  return e;
}
function manifestJson(entries) {
  return JSON.stringify({
    description: "Golden upload corpus (story 0.6a, X-12). expectedCode is captured from Next (apps/web prepareConceptImage / prepareFinalZip) by src/lib/__tests__/golden-upload-corpus.test.ts; null = accepted. branch is the Next error message the file is built to reach, verified on every run. laravelExpectedCode is present only where Laravel deliberately differs (DV-13). Files under .generated/ are built by generate.mjs and not committed.",
    cases: entries,
  }, null, 2) + "\n";
}

function buildAll({ includeGenerated, write }) {
  const previous = readManifest();
  const entries = [], built = new Map(), problems = [];
  for (const c of cases) {
    const file = fileOf(c);
    const generated = file.startsWith(".generated/");
    let bytes = built.get(file);
    if (!bytes) {
      if (generated && !includeGenerated) {
        const old = previous.get(c.id);
        if (!old) throw new Error(`${c.id}: generated file has no manifest entry yet; run without --committed first`);
        entries.push({ ...entryFor(c, new Uint8Array(), old), size: old.size, sha256: old.sha256 });
        continue;
      }
      bytes = buildOf(c);
      built.set(file, bytes);
      const path = join(HERE, file);
      if (write) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes); }
      else if (!generated && (!existsSync(path) || sha256(readFileSync(path)) !== sha256(bytes))) problems.push(`${file} differs from the generator`);
      if (!generated && bytes.length >= 200 * 1024) problems.push(`${file} is ${bytes.length} bytes; committed files must stay under 200 KB`);
    }
    entries.push(entryFor(c, bytes, previous.get(c.id)));
  }
  return { entries, problems };
}

function ensureGenerated() {
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const done = new Set();
  for (const e of manifest.cases.filter((x) => x.generated)) {
    if (done.has(e.file)) continue;
    done.add(e.file);
    const path = join(HERE, e.file);
    if (existsSync(path) && statSync(path).size === e.size) continue;
    const c = byId.get(e.id);
    const bytes = buildOf(c);
    if (sha256(bytes) !== e.sha256) throw new Error(`${e.id}: regenerated bytes do not match manifest sha256`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
    console.log(`generated ${e.file} (${bytes.length} bytes)`);
  }
}

const args = new Set(process.argv.slice(2));
if (args.has("--generated")) ensureGenerated();
else if (args.has("--check")) {
  const { entries, problems } = buildAll({ includeGenerated: false, write: false });
  const current = existsSync(MANIFEST) ? readFileSync(MANIFEST, "utf8") : "";
  if (manifestJson(entries) !== current) problems.push("manifest.json differs from the generator (run node generate.mjs)");
  if (problems.length) { console.error(`Corpus check failed:\n- ${problems.join("\n- ")}`); process.exit(1); }
  console.log(`Corpus OK: ${entries.length} cases (${entries.filter((e) => !e.generated).length} committed, ${entries.filter((e) => e.generated).length} generated).`);
} else {
  const { entries, problems } = buildAll({ includeGenerated: !args.has("--committed"), write: true });
  writeFileSync(MANIFEST, manifestJson(entries));
  if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
  console.log(`Wrote ${entries.length} cases to manifest.json.`);
}

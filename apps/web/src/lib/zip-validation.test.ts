import { describe, expect, it } from "vitest";
import { deflateRawSync } from "node:zlib";
import { crc32, validateZip } from "./zip-validation";

type Entry = { name?: string | Uint8Array; localName?: string; data?: Uint8Array; deflate?: boolean; declaredSize?: number; descriptor?: "signed" | "unsigned"; extra?: Uint8Array; attrs?: number; utf8?: boolean };
function zip(entries: Entry[]) {
  const local: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = typeof e.name === "string" || !e.name ? Buffer.from(e.name ?? "logo.txt") : Buffer.from(e.name);
    const lname = e.localName ? Buffer.from(e.localName) : name;
    const data = Buffer.from(e.data ?? "logo"), payload = e.deflate ? deflateRawSync(data) : data;
    const extra = Buffer.from(e.extra ?? []), size = e.declaredSize ?? data.length, crc = crc32(data), flags = (e.utf8 ? 0x800 : 0) | (e.descriptor ? 8 : 0);
    const l = Buffer.alloc(30 + lname.length + extra.length);
    l.writeUInt32LE(0x04034b50); l.writeUInt16LE(20,4); l.writeUInt16LE(flags,6); l.writeUInt16LE(e.deflate ? 8 : 0,8);
    if (!e.descriptor) { l.writeUInt32LE(crc,14); l.writeUInt32LE(payload.length,18); l.writeUInt32LE(size,22); }
    l.writeUInt16LE(lname.length,26); l.writeUInt16LE(extra.length,28); lname.copy(l,30); extra.copy(l,30+lname.length);
    const desc = Buffer.alloc(e.descriptor === "signed" ? 16 : e.descriptor ? 12 : 0);
    if (e.descriptor) { const p = desc.length - 12; if(p) desc.writeUInt32LE(0x08074b50); desc.writeUInt32LE(crc,p); desc.writeUInt32LE(payload.length,p+4); desc.writeUInt32LE(size,p+8); }
    local.push(l,payload,desc);
    const c = Buffer.alloc(46 + name.length + extra.length);
    c.writeUInt32LE(0x02014b50); c.writeUInt16LE(0x314,4); c.writeUInt16LE(20,6); c.writeUInt16LE(flags,8); c.writeUInt16LE(e.deflate ? 8 : 0,10);
    c.writeUInt32LE(crc,16); c.writeUInt32LE(payload.length,20); c.writeUInt32LE(size,24); c.writeUInt16LE(name.length,28); c.writeUInt16LE(extra.length,30); c.writeUInt32LE((e.attrs ?? 0) >>> 0,38); c.writeUInt32LE(offset,42);
    name.copy(c,46); extra.copy(c,46+name.length); central.push(c); offset += l.length + payload.length + desc.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length,8); end.writeUInt16LE(entries.length,10); end.writeUInt32LE(cd.length,12); end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,cd,end]);
}
const rejects = (b: Uint8Array) => expect(validateZip(b)).rejects.toMatchObject({ name: "UploadValidationError" });

describe("ZIP actual payload and portable extraction policy", () => {
  it.each([undefined, "signed", "unsigned"] as const)("accepts stored and real deflate with %s descriptors", async descriptor => {
    await expect(validateZip(zip([{ name:"logo.txt", data:Buffer.from("a reasonably sized logo payload"), deflate:true, descriptor }, {name:"other.txt"}]))).resolves.toBeUndefined();
  });
  it("accepts legacy CP437 names and UTF-8 accents", async () => {
    await expect(validateZip(zip([{name:new Uint8Array([99,97,102,130,46,116,120,116])}]))).resolves.toBeUndefined();
    await expect(validateZip(zip([{name:"café.txt", utf8:true}]))).resolves.toBeUndefined();
  });
  it("rejects local/central decoded filename differences and unsafe aliases", async () => {
    await rejects(zip([{ name:"safe/logo.txt",localName:"../evil.txt" }]));
    for (const name of ["../x", "a\\b", "C:x", "x. ", "NUL.txt", "a//b", "a/./b", "a/../b", "ｅvil.txt", "e\u0301.txt"]) await rejects(zip([{name,utf8:true}]));
  });
  it("rejects Unicode path extras in either header, symlinks and special files", async () => {
    const extra = new Uint8Array([0x75,0x70,1,0,1]);
    await rejects(zip([{extra}]));
    for (const mode of [0xa000,0x1000,0x2000,0x6000,0xc000]) await rejects(zip([{attrs: mode * 65536}]));
  });
  it("rejects casefold collisions and file ancestor collisions", async () => {
    await rejects(zip([{name:"Logo.txt"},{name:"logo.TXT"}]));
    await rejects(zip([{name:"a"},{name:"a/b"}]));
  });
  it("rejects actual deflate bombs even with a false small declaration", async () => {
    await rejects(zip([{ deflate:true, data:Buffer.alloc(2*1024*1024,65), declaredSize:1 }]));
    await expect(validateZip(zip([{ deflate:true, data:Buffer.alloc(2*1024*1024,65) }]))).rejects.toMatchObject({code:"ZIP_LIMIT_EXCEEDED"});
  });
  it("verifies stored sizes, payload CRC, deflate truncation/trailing bytes and descriptors", async () => {
    await rejects(zip([{declaredSize:1}]));
    const corrupt = zip([{}]); corrupt[30 + "logo.txt".length] ^= 1; await rejects(corrupt);
    const deflate = zip([{deflate:true}]); deflate[30 + "logo.txt".length] = 0xff; await rejects(deflate);
    const desc = zip([{descriptor:"signed"}]); desc[30 + "logo.txt".length + 4 + 8] ^= 1; await rejects(desc);
    const crc = zip([{}]); crc.writeUInt32LE(1,14); await rejects(crc);
  });
  it("rejects repeated/overlapping local records", async () => {
    const b = zip([{name:"first.txt"},{name:"other.txt"}]);
    const cd = b.readUInt32LE(b.length-6); const second = cd + 46 + "first.txt".length;
    b.writeUInt32LE(0,second+42); await rejects(b);
  });
});

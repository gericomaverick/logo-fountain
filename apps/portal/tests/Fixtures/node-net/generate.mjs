// Story 1.5 (X-05): records what Node really does, so the PHP port of `trustedClientAddress`
// (apps/web/src/lib/auth/client-address.ts) can be checked against it byte for byte.
// Regenerate (Docker only, the Node the parity stack runs):
//   docker run --rm -v "$PWD/tests/Fixtures/node-net:/f" node:24.22.2-alpine3.23 node /f/generate.mjs
// Outputs (committed): isip.json ({ node, cases: [[input, isIP result]] }) and trim.json (the code
// points String.prototype.trim strips, 0..0xFFFF). Inputs are latin1 strings: one char per byte,
// which is how Node's HTTP parser hands header values to Next (verified in the story record).
import { isIP } from "node:net";
import { writeFileSync } from "node:fs";

let seed = 0x1505;
const rand = (n) => {
  seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
  return (seed >>> 8) % n;
};
const pick = (list) => list[rand(list.length)];
const hex = () => (rand(0x10000)).toString(16).slice(0, 1 + rand(4));
const v4 = () => [0, 0, 0, 0].map(() => pick([String(rand(256)), String(rand(10)), "255", "0"])).join(".");

const curated = [
  "", " ", "1.2.3.4", "0.0.0.0", "255.255.255.255", "256.1.1.1", "1.2.3", "1.2.3.4.5", "1.2.3.", ".1.2.3",
  "01.2.3.4", "1.02.3.4", "1.2.3.04", "1.2.3.00", "00.0.0.0", "1.2.3.4 ", " 1.2.3.4", "1.2.3.4\n", "1.2.3.4\r\n",
  "\n1.2.3.4", "1.2.3.4\0", "1.2.3.4 ", "1.2.3.4/32", "1.2.3.4:80", "0x7f.0.0.1", "127.1", "2130706433",
  "1.2.3.-4", "+1.2.3.4", "1.2.3.4,", "1.2.3.4, 5.6.7.8", "\u00b9.2.3.4",
  "::", "::1", "1::", "1::1", "::ffff:1.2.3.4", "::ffff:01.2.3.4", "::1.2.3.4", "1:2:3:4:5:6:1.2.3.4",
  "1:2:3:4:5:6:7:8", "1:2:3:4:5:6:7:8:9", "1:2:3:4:5:6:7::", "::2:3:4:5:6:7:8", "1:2:3:4:5:6:7:8::",
  "1::2::3", ":1::", "1:::2", "12345::", "fffff::", "FFFF::", "FfFf::aBcD", "2001:db8::1", "2001:DB8::1",
  "2001:0db8:0000:0000:0000:0000:0000:0001", "02001:db8::1", "g::1", "[::1]", "[2001:db8::1]:443",
  "fe80::1%eth0", "fe80::1%", "fe80::1%1", "fe80::1%en0.1", "fe80::1%a:b", "fe80::1%a-b", "fe80::1%a_b",
  "fe80::1%a b", "fe80::1%%", "fe80::1%eth0\n", "1.2.3.4%eth0", "::ffff:1.2.3.4%z", "::%z", "%z",
  "fe80::1%é", "1:2:3:4:5:6:7:1.2.3.4", "1:2:3:4:5:1.2.3.4", "::1.2.3", "::1.2.3.4.5", "1::1.2.3.4",
  "1:2:3:4:5:6::1.2.3.4", "1:2:3:4:5::1.2.3.4", ":::", "::::", "1:", ":1", "1:2", " ::1", "::1 ", "::1\t",
];

const generated = [];
for (let i = 0; i < 1500; i++) {
  const groups = 1 + rand(8);
  const parts = Array.from({ length: groups }, hex);
  let s = parts.join(":");
  const at = rand(groups + 1);
  if (rand(3) > 0) s = [...parts.slice(0, at), "", ...parts.slice(at)].join(":").replace(/^:(?!:)/, "::").replace(/(?<!:):$/, "::");
  if (rand(4) === 0) s += ":" + v4();
  if (rand(6) === 0) s += "%" + pick(["eth0", "1", "a.b", "a:b", "x-y", "_", "é", ""]);
  if (rand(10) === 0) s = s.toUpperCase();
  generated.push(s);
}
for (let i = 0; i < 800; i++) {
  let s = v4();
  if (rand(5) === 0) s = s.replace(/\d+/, (m) => "0" + m);
  if (rand(8) === 0) s += pick([".", "\n", " ", " ", ",", "%1"]);
  generated.push(s);
}
const alphabet = "0123456789abcdefABCDEFgxz:.%-_ ,\n\t[]/ ";
for (let i = 0; i < 1200; i++) {
  generated.push(Array.from({ length: 1 + rand(24) }, () => alphabet[rand(alphabet.length)]).join(""));
}

const inputs = [...new Set([...curated, ...generated])];
for (const s of inputs) if ([...s].some((c) => c.charCodeAt(0) > 0xff)) throw new Error(`not latin1: ${JSON.stringify(s)}`);
writeFileSync(new URL("./isip.json", import.meta.url), JSON.stringify({ node: process.version, cases: inputs.map((s) => [s, isIP(s)]) }) + "\n");

const trimmed = [];
for (let cp = 0; cp <= 0xffff; cp++) if (String.fromCharCode(cp).trim() === "") trimmed.push(cp);
writeFileSync(new URL("./trim.json", import.meta.url), JSON.stringify({ node: process.version, codePoints: trimmed }) + "\n");
console.log(`isip.json: ${inputs.length} cases; trim.json: ${trimmed.length} code points (${process.version})`);

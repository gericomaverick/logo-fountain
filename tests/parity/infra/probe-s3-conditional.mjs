#!/usr/bin/env node
// S3 stand-in probe (story 0.2; research-technical §6.2). Run against the running stack.
// Exit 0 only if SeaweedFS behaves like R2 for everything the apps rely on:
//   1. both buckets exist (bootstrap)
//   2. PUT key twice with If-None-Match: * -> 200, then 412, and the first body survives
//   3. N concurrent create-only PUTs on one key -> exactly one 200, the rest 412
//   4. HEAD returns the object metadata
//   5. presigned GET honours response-content-disposition (UTF-8 filename*)
//   6. a wrong Content-MD5 is rejected (400 BadDigest)
import { createHash, randomUUID } from "node:crypto";
import { infra } from "./lib/env.mjs";
import { presignGet, s3Request } from "./lib/sigv4.mjs";

const { endpoint, accessKey, secretKey, buckets } = infra.s3;
const req = (opts) => s3Request({ endpoint, accessKey, secretKey, ...opts });
const md5 = (s) => createHash("md5").update(s).digest("base64");
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}  (${detail})`); };

const bucket = buckets.concepts;
const run = randomUUID();

for (const b of [buckets.concepts, buckets.finals]) {
  const r = await req({ method: "HEAD", path: `/${b}` });
  check(`bucket ${b} exists`, r.status === 200, `HEAD bucket -> ${r.status}`);
}

{
  const key = `probe/${run}/sequential.txt`;
  const put = (body) => req({ method: "PUT", path: `/${bucket}/${key}`, body, headers: { "if-none-match": "*", "content-type": "text/plain", "content-md5": md5(body) } });
  const first = await put("first");
  const second = await put("second");
  const get = await req({ method: "GET", path: `/${bucket}/${key}` });
  const body = await get.text();
  check("If-None-Match: * create-only PUT (sequential)", first.status === 200 && second.status === 412 && body === "first",
    `first ${first.status}, second ${second.status}, stored body "${body}"`);
}

{
  const key = `probe/${run}/concurrent.txt`;
  const n = 8;
  const statuses = await Promise.all(Array.from({ length: n }, (_, i) => {
    const body = `writer-${i}`;
    return req({ method: "PUT", path: `/${bucket}/${key}`, body, headers: { "if-none-match": "*", "content-md5": md5(body) } }).then((r) => r.status);
  }));
  const ok = statuses.filter((s) => s === 200).length;
  const conflict = statuses.filter((s) => s === 412).length;
  check(`If-None-Match: * create-only PUT (${n} concurrent)`, ok === 1 && conflict === n - 1, `statuses ${statuses.join(",")}`);
}

{
  const key = `probe/${run}/head.png`;
  const body = "not-really-a-png";
  await req({ method: "PUT", path: `/${bucket}/${key}`, body, headers: { "content-type": "image/png", "cache-control": "private, max-age=3600", "content-md5": md5(body) } });
  const head = await req({ method: "HEAD", path: `/${bucket}/${key}` });
  check("HEAD object", head.status === 200 && head.headers.get("content-length") === String(body.length) && head.headers.get("content-type") === "image/png",
    `${head.status}, length ${head.headers.get("content-length")}, type ${head.headers.get("content-type")}`);

  const disposition = `attachment; filename="logo-final.zip"; filename*=UTF-8''${encodeURIComponent("Café logo – final.zip")}`;
  const url = presignGet({ endpoint, accessKey, secretKey, path: `/${bucket}/${key}`, query: { "response-content-disposition": disposition } });
  const get = await fetch(url);
  const got = get.headers.get("content-disposition");
  check("presigned GET with response-content-disposition", get.status === 200 && got === disposition && (await get.text()) === body, `${get.status}, content-disposition: ${got}`);

  const bad = await fetch(url.replace(/X-Amz-Signature=[0-9a-f]+/, "X-Amz-Signature=" + "0".repeat(64)));
  check("presigned GET with a bad signature is refused", bad.status === 403, `${bad.status}`);
}

{
  const r = await fetch(`${endpoint}/${bucket}/probe/${run}/anonymous.txt`, { method: "PUT", body: "x" });
  check("unsigned PUT is refused (private buckets)", r.status === 403, `${r.status}`);
}

{
  const key = `probe/${run}/md5.txt`;
  const r = await req({ method: "PUT", path: `/${bucket}/${key}`, body: "payload", headers: { "content-md5": md5("something else") } });
  const text = await r.text();
  check("Content-MD5 mismatch rejected", r.status === 400 && /BadDigest/.test(text), `${r.status} ${(text.match(/<Code>([^<]+)/) || [])[1] ?? ""}`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\nS3 probe: ${results.length - failed.length}/${results.length} passed against ${endpoint}`);
if (failed.length) {
  console.log("Fallback (test strategy §3): X-10 conditional-write tests move to L3 with a stub, plus the live L9 check against R2.");
  process.exit(1);
}

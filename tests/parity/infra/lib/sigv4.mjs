// Minimal AWS Signature V4 for S3 (path-style), enough for the infra probes.
// No dependencies. Not a general-purpose client.
import { createHash, createHmac } from "node:crypto";

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const hmac = (key, data) => createHmac("sha256", key).update(data).digest();
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const encPath = (p) => p.split("/").map(enc).join("/");

function stamp(date) {
  const iso = date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return { amzDate: iso, day: iso.slice(0, 8) };
}

function signingKey(secret, day, region) {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, day), region), "s3"), "aws4_request");
}

function canonicalQuery(query) {
  return Object.keys(query).sort().map((k) => `${enc(k)}=${enc(String(query[k]))}`).join("&");
}

/** Signs and sends an S3 request. Returns the fetch Response. */
export async function s3Request({ endpoint, accessKey, secretKey, region = "us-east-1", method, path, query = {}, headers = {}, body }) {
  const url = new URL(endpoint);
  const { amzDate, day } = stamp(new Date());
  const payload = body ?? "";
  const payloadHash = sha256(payload);
  const all = { ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim()])),
    host: url.host, "x-amz-date": amzDate, "x-amz-content-sha256": payloadHash };
  const names = Object.keys(all).sort();
  const canonical = [method, encPath(path), canonicalQuery(query), names.map((n) => `${n}:${all[n]}\n`).join(""), names.join(";"), payloadHash].join("\n");
  const scope = `${day}/${region}/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n");
  const signature = createHmac("sha256", signingKey(secretKey, day, region)).update(toSign).digest("hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}`;
  const qs = canonicalQuery(query);
  const { host, ...sendHeaders } = all;
  void host;
  return fetch(`${url.origin}${encPath(path)}${qs ? `?${qs}` : ""}`, { method, headers: { ...sendHeaders, authorization }, body: method === "GET" || method === "HEAD" ? undefined : payload });
}

/** Builds a presigned GET URL (query-string auth, UNSIGNED-PAYLOAD). */
export function presignGet({ endpoint, accessKey, secretKey, region = "us-east-1", path, expires = 300, query = {} }) {
  const url = new URL(endpoint);
  const { amzDate, day } = stamp(new Date());
  const scope = `${day}/${region}/s3/aws4_request`;
  const q = { ...query, "X-Amz-Algorithm": "AWS4-HMAC-SHA256", "X-Amz-Credential": `${accessKey}/${scope}`,
    "X-Amz-Date": amzDate, "X-Amz-Expires": String(expires), "X-Amz-SignedHeaders": "host" };
  const canonical = ["GET", encPath(path), canonicalQuery(q), `host:${url.host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n");
  const signature = createHmac("sha256", signingKey(secretKey, day, region)).update(toSign).digest("hex");
  return `${url.origin}${encPath(path)}?${canonicalQuery(q)}&X-Amz-Signature=${signature}`;
}

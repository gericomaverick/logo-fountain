// postmark-shim (story 0.2): a Postmark-compatible `POST /email` that delivers to Mailpit.
// No dependencies. Both apps point their Postmark base URL here in parity mode.
//
//   POST /email     Postmark JSON {From, To, Cc?, Bcc?, Subject, TextBody, HtmlBody, MessageStream?, ReplyTo?, Tag?}
//                   with header X-Postmark-Server-Token -> forwards to Mailpit POST /api/v1/send
//   POST /__fail    {"count": N, "status"?: 500} -> the next N sends fail with that status (A-11 tests)
//   POST /__reset   clears pending failures and the sent log
//   GET  /__sent    what the shim accepted (metadata only)
//   GET  /__health
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.PORT || 8080);
const MAILPIT_URL = (process.env.MAILPIT_URL || "http://127.0.0.1:8025").replace(/\/$/, "");
const REQUIRED_TOKEN = process.env.POSTMARK_SHIM_TOKEN || "";

let failures = []; // queue of statuses to return for the next sends
let sent = [];

const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
};

const readBody = (req) => new Promise((resolve, reject) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  req.on("error", reject);
});

/** "Name <a@b>, c@d" -> [{Name, Email}] */
export function parseAddresses(value) {
  if (!value || typeof value !== "string") return [];
  return value.split(",").map((part) => part.trim()).filter(Boolean).map((part) => {
    const m = part.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
    return m ? { Name: m[1].trim(), Email: m[2].trim() } : { Name: "", Email: part };
  });
}

async function handleEmail(req, res) {
  const token = req.headers["x-postmark-server-token"];
  if (!token || (REQUIRED_TOKEN && token !== REQUIRED_TOKEN)) {
    return json(res, 401, { ErrorCode: 10, Message: "Request does not contain a valid Server token." });
  }
  let msg;
  try { msg = JSON.parse(await readBody(req)); } catch {
    return json(res, 422, { ErrorCode: 402, Message: "Received invalid JSON input." });
  }
  const from = parseAddresses(msg.From)[0];
  const to = parseAddresses(msg.To);
  if (!from) return json(res, 422, { ErrorCode: 300, Message: "Invalid 'From' address: ''." });
  if (!to.length) return json(res, 422, { ErrorCode: 300, Message: "Zero recipients specified" });
  if (!msg.TextBody && !msg.HtmlBody) return json(res, 422, { ErrorCode: 300, Message: "Provide either email TextBody or HtmlBody or both." });

  if (failures.length) {
    const status = failures.shift();
    return json(res, status, { ErrorCode: 701, Message: `postmark-shim: injected failure (${status}).` });
  }

  const messageId = randomUUID();
  const stream = msg.MessageStream || "outbound";
  const payload = {
    From: from, To: to, Cc: parseAddresses(msg.Cc), Bcc: parseAddresses(msg.Bcc).map((a) => a.Email),
    ReplyTo: parseAddresses(msg.ReplyTo), Subject: msg.Subject ?? "",
    Text: msg.TextBody ?? "", HTML: msg.HtmlBody ?? "",
    Tags: msg.Tag ? [String(msg.Tag)] : [],
    Headers: { "X-PM-Message-Stream": stream, "X-Postmark-Shim-Message-ID": messageId },
  };
  let upstream;
  try {
    upstream = await fetch(`${MAILPIT_URL}/api/v1/send`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  } catch (error) {
    return json(res, 502, { ErrorCode: 702, Message: `postmark-shim: Mailpit unreachable (${error.message}).` });
  }
  if (!upstream.ok) {
    return json(res, 502, { ErrorCode: 703, Message: `postmark-shim: Mailpit returned ${upstream.status}.` });
  }
  const { ID: mailpitId } = await upstream.json();
  const submittedAt = new Date().toISOString();
  sent.push({ messageId, mailpitId, to: msg.To, subject: msg.Subject, stream, submittedAt });
  return json(res, 200, { To: msg.To, SubmittedAt: submittedAt, MessageID: messageId, ErrorCode: 0, Message: "OK" });
}

const server = createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, "http://shim");
    if (req.method === "POST" && pathname === "/email") return await handleEmail(req, res);
    if (req.method === "POST" && pathname === "/__fail") {
      const raw = await readBody(req);
      const { count = 1, status = 500 } = raw ? JSON.parse(raw) : {};
      failures = Array.from({ length: Math.max(0, Number(count)) }, () => Number(status));
      return json(res, 200, { pendingFailures: failures.length, status: Number(status) });
    }
    if (req.method === "POST" && pathname === "/__reset") { failures = []; sent = []; return json(res, 200, { ok: true }); }
    if (req.method === "GET" && pathname === "/__sent") return json(res, 200, { pendingFailures: failures.length, sent });
    if (req.method === "GET" && pathname === "/__health") return json(res, 200, { ok: true });
    return json(res, 404, { ErrorCode: 404, Message: `postmark-shim: no route for ${req.method} ${pathname}` });
  } catch (error) {
    return json(res, 500, { ErrorCode: 500, Message: `postmark-shim error: ${error.message}` });
  }
});

server.listen(PORT, () => console.log(`postmark-shim listening on :${PORT}, forwarding to ${MAILPIT_URL}`));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => server.close(() => process.exit(0)));

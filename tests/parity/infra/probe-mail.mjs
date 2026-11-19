#!/usr/bin/env node
// postmark-shim -> Mailpit round trip (story 0.2). Run against the running stack.
import { randomUUID } from "node:crypto";
import { infra } from "./lib/env.mjs";

const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}  (${detail})`); };
const send = (body, token = "parity-test-only-postmark-token") => fetch(`${infra.postmarkShim}/email`, {
  method: "POST",
  headers: { "content-type": "application/json", accept: "application/json", ...(token ? { "X-Postmark-Server-Token": token } : {}) },
  body: JSON.stringify(body),
});
const message = (subject) => ({ From: "Logo Fountain <studio@example.test>", To: "client@example.test", Subject: subject,
  TextBody: "Plain body", HtmlBody: "<p>HTML body</p>", MessageStream: "outbound" });

async function findInMailpit(subject) {
  for (let i = 0; i < 20; i++) {
    const r = await fetch(`${infra.mailpit}/api/v1/search?query=${encodeURIComponent(`subject:"${subject}"`)}`);
    const { messages = [] } = await r.json();
    if (messages.length) return messages[0];
    await new Promise((res) => setTimeout(res, 100));
  }
  return null;
}

await fetch(`${infra.postmarkShim}/__reset`, { method: "POST" });

{
  const subject = `probe ${randomUUID()}`;
  const r = await send(message(subject));
  const body = await r.json();
  const found = await findInMailpit(subject);
  check("POST /email returns Postmark-like JSON", r.status === 200 && body.ErrorCode === 0 && body.Message === "OK" && !!body.MessageID, `${r.status} ${JSON.stringify(body)}`);
  check("message appears in Mailpit", !!found && found.From.Address === "studio@example.test" && found.To[0].Address === "client@example.test", found ? `id ${found.ID}` : "not found");
  if (found) {
    const headers = await (await fetch(`${infra.mailpit}/api/v1/message/${found.ID}/headers`)).json();
    check("MessageStream travels as X-PM-Message-Stream", headers["X-Pm-Message-Stream"]?.[0] === "outbound" || headers["X-PM-Message-Stream"]?.[0] === "outbound", JSON.stringify(Object.keys(headers).filter((h) => /^x-p/i.test(h))));
  }
}

{
  const r = await send(message("no token"), null);
  check("missing X-Postmark-Server-Token -> 401", r.status === 401, `${r.status}`);
}

{
  await fetch(`${infra.postmarkShim}/__fail`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ count: 2 }) });
  const subject = `after-fail ${randomUUID()}`;
  const statuses = [];
  for (let i = 0; i < 3; i++) statuses.push((await send(message(subject))).status);
  const found = await findInMailpit(subject);
  check("POST /__fail {count:2} -> next two sends 500, third 200", statuses.join(",") === "500,500,200" && !!found, `statuses ${statuses.join(",")}, delivered ${!!found}`);
}

const passed = results.filter(Boolean).length;
console.log(`\nMail probe: ${passed}/${results.length} passed (shim ${infra.postmarkShim}, Mailpit ${infra.mailpit})`);
if (passed !== results.length) process.exit(1);

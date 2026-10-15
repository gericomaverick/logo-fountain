"use client";
export async function postAuth(path: string, body: unknown) {
  const response = await fetch(`/api/auth/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  return { ok: response.ok, error: response.ok ? null : "Authentication could not be completed. Check your details or request a new link." };
}
// Fragment never reaches HTTP logs/referrers. Remove before rendering/linking.
export function takeMailboxProof() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const token = params.get("token") || "";
  const next = params.get("next");
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  return { token, next };
}

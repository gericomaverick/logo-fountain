// HTTP helpers for contract tests (L4). Mutations always send the canonical Origin, as a browser would.
import { request as pwRequest, type APIRequestContext } from "@playwright/test";
import { resolveBaseUrl, resolveTarget } from "./target";

export const baseURL = resolveBaseUrl(resolveTarget());
export const PARITY_PASSWORD = "Parity-Pass-2026!";

/** A fresh, cookie-isolated client. Pass `signInAs` to log in through the real login endpoint. */
export async function apiClient(options: { signInAs?: string; password?: string } = {}): Promise<APIRequestContext> {
  const ctx = await pwRequest.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } });
  if (options.signInAs) {
    const res = await ctx.post("/api/auth/login", { data: { email: options.signInAs, password: options.password ?? PARITY_PASSWORD } });
    if (!res.ok()) throw new Error(`sign-in failed for ${options.signInAs}: ${res.status()} ${await res.text()}`);
  }
  return ctx;
}

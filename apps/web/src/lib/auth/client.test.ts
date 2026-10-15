import { afterEach, describe, expect, it, vi } from "vitest";
import { postAuth, takeMailboxProof } from "./client";
afterEach(() => vi.unstubAllGlobals());
describe("mailbox proof client", () => {
  it("takes proof from fragment, removes it immediately, never uses browser storage", () => {
    const replaceState = vi.fn();
    vi.stubGlobal("window", { location: { hash: "#token=private-mailbox-proof&next=%2Fdashboard", pathname: "/reset-password", search: "" }, history: { replaceState } });
    const result = takeMailboxProof();
    expect(result.next).toBe("/dashboard"); expect(result.token.length).toBeGreaterThan(0);
    expect(replaceState).toHaveBeenCalledWith(null, "", "/reset-password");
  });
  it("sends proof only in a no-store JSON POST", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("{}")); vi.stubGlobal("fetch", fetcher);
    await postAuth("reset-password", { token: "private-mailbox-proof" });
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("/api/auth/reset-password"); expect(options.method).toBe("POST"); expect(options.cache).toBe("no-store");
  });
});

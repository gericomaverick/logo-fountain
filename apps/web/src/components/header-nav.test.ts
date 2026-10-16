import { describe, expect, it, vi } from "vitest";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/dashboard" }));

import { HeaderNav, shouldShowClientInvoicesNav } from "./header-nav";

describe("header invoice nav visibility", () => {
  it("shows top-level Invoices for authenticated client users", () => {
    expect(shouldShowClientInvoicesNav({ authenticated: true, isAdmin: false })).toBe(true);
  });

  it("hides top-level Invoices for authenticated admin users", () => {
    expect(shouldShowClientInvoicesNav({ authenticated: true, isAdmin: true })).toBe(false);
  });

  it("hides top-level Invoices for guests", () => {
    expect(shouldShowClientInvoicesNav({ authenticated: false })).toBe(false);
  });
});


describe("header logo image", () => {
  it("reserves the real SVG aspect at the existing 20px CSS height without optimizer or preload", () => {
    const html = renderToStaticMarkup(createElement(HeaderNav));
    expect(html).toContain('width="410" height="386"');
    expect(html).toContain('class="h-5 w-auto"');
    expect(html).toContain('alt="Logo Fountain"');
    expect(html).toContain('src="/img/logo.svg"');
    expect(html).not.toContain('/_next/image');
    expect(html).not.toContain('srcSet=');
    expect(html).not.toContain('rel="preload"');
  });
});

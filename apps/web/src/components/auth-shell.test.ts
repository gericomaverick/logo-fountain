import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AuthShell } from "./auth-shell";

describe("auth shell images", () => {
  it("sizes desktop-only artwork to the capped half-column without unconditional preload", () => {
    const html = renderToStaticMarkup(AuthShell({
      title: "Sign in", sideImageSrc: "/img/auth/login.jpg", children: "Form",
    }));
    expect(html).toContain('sizes="(min-width: 1200px) 576px, (min-width: 1024px) calc(50vw - 24px), 0px"');
    expect(html).toContain("hidden min-h-full");
    expect(html).toContain("lg:col-span-6 lg:block");
    expect(html).not.toContain('rel="preload"');
    expect(html).toContain('width="410" height="386"');
    expect(html).toContain('class="h-9 w-auto"');
    expect(html).toContain('src="/img/logo.svg"');
  });
});

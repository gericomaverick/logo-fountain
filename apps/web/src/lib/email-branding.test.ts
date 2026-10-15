import { afterEach, describe, expect, it } from "vitest";

import { renderBrandedEmail, resolveEmailLogoUrl } from "./email-branding";

const ORIGINAL_ENV = {
  PUBLIC_SITE_URL: process.env.PUBLIC_SITE_URL,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  EMAIL_LOGO_URL: process.env.EMAIL_LOGO_URL,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key as keyof typeof process.env];
    } else {
      process.env[key as keyof typeof process.env] = value;
    }
  }
}

describe("email-branding", () => {
  afterEach(() => {
    restoreEnv();
  });

  it("uses EMAIL_LOGO_URL when configured as an absolute URL", () => {
    process.env.EMAIL_LOGO_URL = "https://cdn.example.com/logo.svg";
    process.env.PUBLIC_SITE_URL = "https://app.example.com";

    expect(resolveEmailLogoUrl()).toBe("https://cdn.example.com/logo.svg");
  });

  it("falls back to PUBLIC_SITE_URL logo path when EMAIL_LOGO_URL is not set", () => {
    delete process.env.EMAIL_LOGO_URL;
    process.env.PUBLIC_SITE_URL = "https://app.example.com";

    expect(resolveEmailLogoUrl()).toBe("https://app.example.com/img/logo.svg");
  });

  it("falls back to embedded logo when no public origin is available", () => {
    delete process.env.EMAIL_LOGO_URL;
    delete process.env.PUBLIC_SITE_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;

    const html = renderBrandedEmail({
      heading: "Heading",
      intro: "Intro",
      ctaLabel: "Continue",
      ctaUrl: "https://example.com/continue",
    });

    expect(html).toContain("data:image/svg+xml");
    expect(html).toContain("<img src=");
  });

  it("HTML-escapes every dynamic text and attribute at the rendering boundary", () => {
    process.env.EMAIL_LOGO_URL = "https://cdn.example.com/logo.svg?brand=a&size=2";
    const html = renderBrandedEmail({
      heading: 'Hello <img src=x onerror="alert(1)">',
      intro: "Client O'Reilly submitted brief </p><script>alert(1)</script>",
      ctaLabel: "Review <brief> & reply",
      ctaUrl: "https://app.example.com/project/p1?tab=a&next=b",
      footer: 'Footer "quoted"',
    });

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("onerror=\"alert(1)\"");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain("O&#39;Reilly submitted brief &lt;/p&gt;&lt;script&gt;");
    expect(html).toContain("Review &lt;brief&gt; &amp; reply");
    expect(html).toContain('href="https://app.example.com/project/p1?tab=a&amp;next=b"');
    expect(html).toContain('src="https://cdn.example.com/logo.svg?brand=a&amp;size=2"');
    expect(html).toContain("Footer &quot;quoted&quot;");
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "//evil.example/path",
    "https://user:password@example.com/path",
    "https://example.com/path\nmalicious",
    "http://example.com/insecure",
  ])("rejects unsafe CTA URL %s", (ctaUrl) => {
    expect(() => renderBrandedEmail({ heading: "H", intro: "I", ctaLabel: "C", ctaUrl })).toThrow(/CTA URL/);
  });
});

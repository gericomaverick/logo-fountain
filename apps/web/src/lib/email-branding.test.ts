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

  it("renders text brand header when no public origin is available", () => {
    delete process.env.EMAIL_LOGO_URL;
    delete process.env.PUBLIC_SITE_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;

    const html = renderBrandedEmail({
      heading: "Heading",
      intro: "Intro",
      ctaLabel: "Continue",
      ctaUrl: "https://example.com/continue",
    });

    expect(html).toContain("Logo Fountain</div>");
    expect(html).not.toContain("<img src=");
  });
});

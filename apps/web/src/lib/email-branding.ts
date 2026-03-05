import { getConfiguredPublicSiteOrigin } from "@/lib/request-origin";

type BrandedEmailInput = {
  heading: string;
  intro: string;
  ctaLabel: string;
  ctaUrl: string;
  footer?: string;
};

function normalizeAbsoluteUrl(value: string | undefined): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function resolveEmailLogoUrl(): string | null {
  const explicit = normalizeAbsoluteUrl(process.env.EMAIL_LOGO_URL);
  if (explicit) return explicit;

  const configuredOrigin = getConfiguredPublicSiteOrigin();
  if (!configuredOrigin) return null;

  return new URL("/img/logo.svg", configuredOrigin).toString();
}

export function renderBrandedEmail({ heading, intro, ctaLabel, ctaUrl, footer }: BrandedEmailInput): string {
  const logo = resolveEmailLogoUrl();
  const brandHeader = logo
    ? `<img src="${logo}" alt="Logo Fountain" style="height:34px;display:block;"/>`
    : '<div style="font-size:20px;font-weight:700;line-height:1.2;color:#1d1330;">Logo Fountain</div>';

  return [
    '<div style="background:#f8f7ff;padding:24px;font-family:Inter,Arial,sans-serif;color:#1d1330;">',
    '<div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #ebe7ff;border-radius:14px;overflow:hidden;">',
    '<div style="padding:20px 24px;border-bottom:1px solid #f0ecff;background:#faf9ff;">',
    brandHeader,
    "</div>",
    '<div style="padding:28px 24px;">',
    `<h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;color:#1d1330;">${heading}</h1>`,
    `<p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:#43355f;">${intro}</p>`,
    `<a href="${ctaUrl}" style="display:inline-block;background:#5b38f0;color:#ffffff !important;text-decoration:none;font-weight:600;padding:12px 18px;border-radius:10px;">${ctaLabel}</a>`,
    footer ? `<p style="margin:18px 0 0;font-size:13px;line-height:1.5;color:#6f6590;">${footer}</p>` : "",
    "</div>",
    "</div>",
    "</div>",
  ].join("");
}

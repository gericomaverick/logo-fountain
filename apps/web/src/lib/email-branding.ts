import { getConfiguredPublicSiteOrigin } from "@/lib/request-origin";

type BrandedEmailInput = {
  heading: string;
  intro: string;
  ctaLabel: string;
  ctaUrl: string;
  footer?: string;
};

function normalizeAbsoluteUrl(value: string | undefined, allowLoopbackHttp = false): string | null {
  if (!value || /[\u0000-\u001f\u007f]/.test(value)) return null;

  try {
    const url = new URL(value);
    const isLoopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
    if (url.username || url.password || (url.protocol !== "https:" && !(allowLoopbackHttp && url.protocol === "http:" && isLoopback))) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
}

function requireSafeCtaUrl(value: string): string {
  const normalized = normalizeAbsoluteUrl(value, process.env.NODE_ENV !== "production");
  if (!normalized) throw new TypeError("Transactional email CTA URL must be an absolute HTTPS URL");
  return normalized;
}

function canUseRemoteLogo(origin: string): boolean {
  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return false;
    return true;
  } catch {
    return false;
  }
}

function getEmbeddedLogoDataUri(): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='34' viewBox='0 0 240 34' role='img' aria-label='Logo Fountain'><rect width='240' height='34' rx='8' fill='#f4f0ff'/><text x='12' y='23' font-family='Arial,sans-serif' font-size='16' font-weight='700' fill='#1d1330'>Logo Fountain</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function resolveEmailLogoUrl(): string | null {
  const explicit = normalizeAbsoluteUrl(process.env.EMAIL_LOGO_URL);
  if (explicit) return explicit;

  const configuredOrigin = getConfiguredPublicSiteOrigin();
  if (!configuredOrigin || !canUseRemoteLogo(configuredOrigin)) return null;

  return new URL("/img/logo.svg", configuredOrigin).toString();
}

export function renderBrandedEmail({ heading, intro, ctaLabel, ctaUrl, footer }: BrandedEmailInput): string {
  const logo = resolveEmailLogoUrl();
  const embeddedLogo = getEmbeddedLogoDataUri();
  const brandHeader = logo
    ? `<img src="${escapeHtml(logo)}" alt="Logo Fountain" style="height:34px;display:block;"/>`
    : `<img src="${escapeHtml(embeddedLogo)}" alt="Logo Fountain" style="height:34px;display:block;"/>`;
  const safeCtaUrl = requireSafeCtaUrl(ctaUrl);

  return [
    '<div style="background:#f8f7ff;padding:24px;font-family:Inter,Arial,sans-serif;color:#1d1330;">',
    '<div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #ebe7ff;border-radius:14px;overflow:hidden;">',
    '<div style="padding:20px 24px;border-bottom:1px solid #f0ecff;background:#faf9ff;">',
    brandHeader,
    "</div>",
    '<div style="padding:28px 24px;">',
    `<h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;color:#1d1330;">${escapeHtml(heading)}</h1>`,
    `<p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:#43355f;">${escapeHtml(intro)}</p>`,
    `<a href="${escapeHtml(safeCtaUrl)}" style="display:inline-block;background:#5b38f0;color:#ffffff !important;text-decoration:none;font-weight:600;padding:12px 18px;border-radius:10px;">${escapeHtml(ctaLabel)}</a>`,
    footer ? `<p style="margin:18px 0 0;font-size:13px;line-height:1.5;color:#6f6590;">${escapeHtml(footer)}</p>` : "",
    "</div>",
    "</div>",
    "</div>",
  ].join("");
}

import type { NextConfig } from "next";
import path from "path";

// Report-only currently means manual browser-console diagnostics; no collector is configured.
const isDevelopment = process.env.NODE_ENV === "development";
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""} https://js.stripe.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.stripe.com",
  "frame-src https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

const securityHeaders = [
  // Staged as report-only until production telemetry confirms that Next,
  // auth, Stripe, and deployed asset hosts are all represented.
  { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(self \"https://js.stripe.com\" \"https://checkout.stripe.com\"), usb=()",
  },
];

const nextConfig: NextConfig = {
  // This repo is not the OpenClaw workspace root; ensure Next/Turbopack treats this folder as the app root.
  turbopack: {
    root: path.resolve(__dirname),
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/:path(auth/callback|set-password|reset-password)", headers: [{ key: "Referrer-Policy", value: "no-referrer" }, { key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;

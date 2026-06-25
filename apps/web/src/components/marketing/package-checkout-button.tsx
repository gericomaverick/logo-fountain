"use client";

import { useState } from "react";

import {
  PACKAGE_TO_PRICE_ID,
  isPlaceholderPriceId,
  type PackageCode,
} from "@/lib/stripe-price-allowlist";

type ApiErrorPayload = {
  error?: string | { message?: string };
  message?: string;
  url?: string;
};

function parseApiError(payload: ApiErrorPayload | null): string | null {
  if (!payload) return null;
  if (typeof payload.error === "string") return payload.error;
  if (payload.error && typeof payload.error === "object" && typeof payload.error.message === "string") {
    return payload.error.message;
  }
  if (typeof payload.message === "string") return payload.message;
  return null;
}

export function PackageCheckoutButton({
  packageCode,
  children,
  className = "",
}: {
  packageCode: PackageCode;
  children: React.ReactNode;
  className?: string;
}) {
  const [isSubmitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function startCheckout() {
    const mappedPriceId = PACKAGE_TO_PRICE_ID[packageCode];
    if (isPlaceholderPriceId(mappedPriceId)) {
      setErrorMessage("Checkout is temporarily unavailable for this package. Please contact support.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/checkout/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ package_code: packageCode }),
      });

      const isJson = res.headers.get("content-type")?.includes("application/json");
      const data = isJson ? ((await res.json().catch(() => null)) as ApiErrorPayload | null) : null;

      if (!res.ok) {
        throw new Error(parseApiError(data) ?? `Unable to start checkout (HTTP ${res.status})`);
      }

      if (!data?.url) {
        throw new Error("Checkout session was created without a redirect URL. Please contact support.");
      }

      window.location.assign(data.url);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to start checkout");
      setSubmitting(false);
    }
  }

  return (
    <span className="lf-checkout-wrap">
      <button type="button" className={className} onClick={() => void startCheckout()} disabled={isSubmitting}>
        {isSubmitting ? "Redirecting…" : children}
      </button>
      {errorMessage ? <span className="lf-checkout-error" role="alert">{errorMessage}</span> : null}
    </span>
  );
}

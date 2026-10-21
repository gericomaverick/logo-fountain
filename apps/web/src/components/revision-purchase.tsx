"use client";

import { useState, useSyncExternalStore } from "react";

import { UPSELL_DISPLAY_PRICES } from "@/lib/stripe-price-allowlist";

type PurchaseMode = "addon" | "upgrade";

function readError(payload: { error?: { message?: string; details?: { nextStep?: string } } | string } | null, fallback: string): string {
  const err = payload?.error;
  const message = typeof err === "string" ? err : err?.message ?? fallback;
  const nextStep = typeof err === "string" ? undefined : err?.details?.nextStep;
  return nextStep ? `${message} — ${nextStep}` : message;
}

/**
 * Starting a checkout for an extra revision or a bigger package.
 *
 * Shared, because the same purchase is reachable from two places: the prompt
 * that appears when revisions run low, which a person can dismiss, and the
 * allowances card, which is always there.
 */
export function useRevisionPurchase(projectId: string) {
  const [submitting, setSubmitting] = useState<PurchaseMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(body: Record<string, unknown>, mode: PurchaseMode) {
    setSubmitting(mode);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/checkout/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(readError(payload, "Unable to start checkout"));
      if (!payload?.url) throw new Error("Checkout URL missing");
      window.location.assign(payload.url as string);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to start checkout");
      setSubmitting(null);
    }
  }

  return { start, submitting, error };
}

export function upgradeLabel(target: "professional" | "complete"): string {
  return target === "professional" ? "Professional" : "Complete";
}

export function upgradePrice(target: "professional" | "complete"): string {
  return target === "professional"
    ? UPSELL_DISPLAY_PRICES.essential_to_professional
    : UPSELL_DISPLAY_PRICES.professional_to_complete;
}

/**
 * The permanent way to buy more, under the allowances.
 *
 * The prompt that appears when revisions run low can be dismissed, and until
 * now that was the only route to a purchase — someone who waved it away and
 * later needed another revision had nowhere to go. This sits in the card
 * people already open to ask how many they have left, in a tinted block of
 * its own — under the meters as plain text it read as small print.
 */
export function RevisionPurchaseFooter({
  projectId,
  upgradeTo,
}: {
  projectId: string;
  upgradeTo: "professional" | "complete" | null;
}) {
  const { start, submitting, error } = useRevisionPurchase(projectId);

  return (
    /* A block of its own rather than two quiet links: this is the only
       permanent route to buying a revision, and as plain text under the
       meters it read as small print. It takes the same parchment and warm
       rule as the stage and journey panels — 1.13 against the white card, the
       separation those already use — so the colour belongs to the page and
       the purple belongs to the thing you press. */
    <div className="mt-4 rounded-lg border border-line bg-surface p-3">
      <p className="portal-label text-fg">Need more?</p>
      <div className="mt-2 flex flex-col items-start gap-2">
        <button
          type="button"
          className="portal-btn-primary h-9 w-full"
          onClick={() => void start({ kind: "addon", addonKey: "extra_revision" }, "addon")}
          disabled={submitting !== null}
        >
          {submitting === "addon" ? "Redirecting…" : `Buy an extra revision (${UPSELL_DISPLAY_PRICES.extra_revision})`}
        </button>
        {upgradeTo ? (
          <button
            type="button"
            className="portal-link text-accent decoration-[color-mix(in_srgb,var(--accent)_45%,transparent)] hover:text-accent-hover hover:decoration-accent"
            onClick={() => void start({ kind: "upgrade", toPackage: upgradeTo }, "upgrade")}
            disabled={submitting !== null}
          >
            {submitting === "upgrade" ? "Redirecting…" : `Upgrade to ${upgradeLabel(upgradeTo)} (${upgradePrice(upgradeTo)})`}
          </button>
        ) : null}
      </div>
      {error ? <p className="mt-2 text-sm text-danger" role="alert">{error}</p> : null}
    </div>
  );
}

/**
 * Whether this prompt has been waved away in this tab, and how to wave it.
 *
 * Read through useSyncExternalStore rather than in an effect: the store is
 * outside React, the server has no answer to give (hence the third argument,
 * which keeps the first paint honest), and setting state in an effect to catch
 * up with a browser API is the cascade the React lint rule is there to stop.
 * Dismissing is a click, not a side effect, so it sets its own state.
 */
export function useSessionDismissal(key: string): [boolean, () => void] {
  const [dismissedNow, setDismissedNow] = useState(false);

  const stored = useSyncExternalStore(
    (onChange) => {
      window.addEventListener("storage", onChange);
      return () => window.removeEventListener("storage", onChange);
    },
    () => {
      try {
        const raw = window.sessionStorage.getItem(key);
        if (!raw) return false;
        const expiresAt = Number.parseInt(raw, 10);
        return Number.isFinite(expiresAt) && Date.now() < expiresAt;
      } catch {
        // A browser with site data blocked simply has nothing dismissed.
        return false;
      }
    },
    () => false,
  );

  function dismiss() {
    try {
      window.sessionStorage.setItem(key, String(Date.now() + 1000 * 60 * 60 * 24));
    } catch {
      // Not being able to remember the dismissal is not a reason to ignore it.
    }
    setDismissedNow(true);
  }

  return [stored || dismissedNow, dismiss];
}

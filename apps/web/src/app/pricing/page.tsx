"use client";

import { useState } from "react";

import { HeaderNav } from "@/components/header-nav";

type PackageCode = "essential" | "professional" | "complete";

type PricingOption = {
  code: PackageCode;
  name: string;
  description: string;
};

const PACKAGES: PricingOption[] = [
  {
    code: "essential",
    name: "Essential",
    description: "Starter logo package for quick launch.",
  },
  {
    code: "professional",
    name: "Professional",
    description: "Balanced package for growing businesses.",
  },
  {
    code: "complete",
    name: "Complete",
    description: "Full package for maximum flexibility.",
  },
];

export default function PricingPage() {
  const [submittingCode, setSubmittingCode] = useState<PackageCode | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function startCheckout(packageCode: PackageCode) {
    setSubmittingCode(packageCode);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/checkout/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ package_code: packageCode }),
      });

      const data = (await res.json()) as { url?: string; error?: string };

      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Unable to start checkout");
      }

      window.location.assign(data.url);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to start checkout");
      setSubmittingCode(null);
    }
  }

  return (
    <>
      <HeaderNav />
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="text-3xl font-semibold">Pricing</h1>
        <p className="mt-2 text-sm text-neutral-600">Choose a package to continue to secure checkout.</p>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {PACKAGES.map((pkg) => {
          const isSubmitting = submittingCode === pkg.code;

          return (
            <section key={pkg.code} className="rounded-lg border p-4">
              <h2 className="text-lg font-medium">{pkg.name}</h2>
              <p className="mt-2 text-sm text-neutral-600">{pkg.description}</p>
              <button
                type="button"
                className="mt-4 rounded-md bg-black px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => void startCheckout(pkg.code)}
                disabled={submittingCode !== null}
              >
                {isSubmitting ? "Redirecting…" : "Choose"}
              </button>
            </section>
          );
        })}
      </div>

        {errorMessage ? <p className="mt-4 text-sm text-red-600">{errorMessage}</p> : null}
      </main>
    </>
  );
}

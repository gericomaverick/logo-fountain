import { Suspense } from "react";
import SuccessProcessingClient from "./success-processing-client";

function ProcessingFallback() {
  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-semibold">Processing…</h1>
      <p className="mt-2 text-sm text-neutral-600">
        We&apos;re confirming your payment and setting up your project.
      </p>
    </main>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<ProcessingFallback />}>
      <SuccessProcessingClient />
    </Suspense>
  );
}

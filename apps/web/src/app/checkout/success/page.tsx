import { PageHeader } from "@/components/ui";
import { Suspense } from "react";
import SuccessProcessingClient from "./success-processing-client";

function ProcessingFallback() {
  return (
    <div className="min-h-screen bg-app text-fg">
      <PageHeader crumbs={[{ label: "Checkout" }]} />
      <main className="px-4 py-6 md:px-8 lg:py-8">
        <div className="mx-auto max-w-[920px]">
          <h1 className="text-2xl font-semibold tracking-tight text-fg">Processing…</h1>
          <p className="mt-2 text-base text-fg-2">
            We&apos;re confirming your payment and setting up your project.
          </p>
        </div>
      </main>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<ProcessingFallback />}>
      <SuccessProcessingClient />
    </Suspense>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { HeaderNav } from "@/components/header-nav";
import { PageShell } from "@/components/page-shell";

type Invoice = {
  id: string;
  projectId: string;
  projectName: string;
  amountCents: number;
  currency: string;
  status: string;
  date: string;
  invoicePdfUrl: string | null;
  hostedInvoiceUrl: string | null;
  receiptUrl: string | null;
  downloadUrl: string | null;
  documentType: "invoice" | "receipt" | "none";
};

function isPdfUrl(url: string | null | undefined) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return url.toLowerCase().includes(".pdf");
  }
}

function getInvoiceAction(invoice: Invoice): { href: string | null; label: "Download PDF" | "View invoice" | "View receipt"; download: boolean } {
  if (invoice.invoicePdfUrl) {
    return { href: invoice.invoicePdfUrl, label: "Download PDF", download: true };
  }

  if (invoice.hostedInvoiceUrl) {
    const hostedIsPdf = isPdfUrl(invoice.hostedInvoiceUrl);
    return { href: invoice.hostedInvoiceUrl, label: hostedIsPdf ? "Download PDF" : "View invoice", download: hostedIsPdf };
  }

  if (invoice.receiptUrl) {
    return { href: invoice.receiptUrl, label: "View receipt", download: false };
  }

  return { href: null, label: "View invoice", download: false };
}

const DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

function formatAmount(amountCents: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(amountCents / 100);
}

export default function InvoicesSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch("/api/invoices", { cache: "no-store" });
        const payload = (await res.json().catch(() => null)) as { invoices?: Invoice[]; error?: { message?: string } } | null;

        if (!res.ok) {
          setError(payload?.error?.message ?? "Failed to load invoices.");
          return;
        }

        if (!cancelled) setInvoices(payload?.invoices ?? []);
      } catch {
        if (!cancelled) setError("Failed to load invoices.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PageShell>
      <HeaderNav />
      <main className="mx-auto w-full max-w-[1160px] px-6 py-8 md:px-10">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-neutral-900">Invoices</h1>
          <p className="mt-2 text-sm text-neutral-600">Download your Stripe invoices and payment receipts.</p>
          <p className="mt-1 text-xs text-neutral-500">Some older payments may only provide a hosted invoice or receipt link instead of a direct PDF.</p>
          <p className="mt-2 text-sm text-neutral-600">
            <Link className="portal-link no-underline" href="/settings">Back to settings</Link>
          </p>
        </header>

        {loading ? <p className="text-sm text-neutral-500">Loading…</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {!loading && !error && invoices.length === 0 ? (
          <p className="rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-600">No invoices yet.</p>
        ) : null}

        {!loading && !error && invoices.length > 0 ? (
          <section className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
            <table className="min-w-full divide-y divide-neutral-200 text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3">Project</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="px-4 py-3 font-medium text-neutral-900">{invoice.projectName}</td>
                    <td className="px-4 py-3 text-neutral-700">{formatAmount(invoice.amountCents, invoice.currency)}</td>
                    <td className="px-4 py-3 text-neutral-700">{DATE_FORMATTER.format(new Date(invoice.date))}</td>
                    <td className="px-4 py-3 text-neutral-700">{invoice.status}</td>
                    <td className="px-4 py-3">
                      {(() => {
                        const action = getInvoiceAction(invoice);

                        if (!action.href) {
                          return <span className="text-neutral-500">Unavailable</span>;
                        }

                        return (
                          <a
                            href={action.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="portal-link no-underline"
                            download={action.download ? "invoice.pdf" : undefined}
                            type={action.download ? "application/pdf" : undefined}
                          >
                            {action.label}
                          </a>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}
      </main>
    </PageShell>
  );
}

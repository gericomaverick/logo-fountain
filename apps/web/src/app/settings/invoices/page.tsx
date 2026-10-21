"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { HeaderNav } from "@/components/header-nav";
import { PageShell } from "@/components/page-shell";
import { EmptyLine, PageHeader } from "@/components/ui";

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
      <PageHeader
        crumbs={[{ label: "Settings", href: "/settings" }, { label: "Invoices" }]}
        actions={<Link className="portal-btn-ghost" href="/settings">Back to settings</Link>}
      />
      <main className="mx-auto w-full max-w-[1400px] px-4 pb-10 md:px-8 lg:px-10">
        <header className="pb-5 pt-8">
          <h1 className="portal-display text-2xl text-fg">Invoices</h1>
          <p className="mt-1 text-base text-fg-2">Download your Stripe invoices and payment receipts.</p>
          <p className="mt-2 text-sm text-fg-3">Some older payments may only provide a hosted invoice or receipt link instead of a direct PDF.</p>
        </header>

        {loading ? <p className="text-sm text-fg-3">Loading…</p> : null}
        {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}

        {!loading && !error && invoices.length === 0 ? (
          <EmptyLine>No invoices yet.</EmptyLine>
        ) : null}

        {!loading && !error && invoices.length > 0 ? (
          <section className="rounded-xl border border-line bg-panel">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-line text-base">
                <thead className="h-11 text-left text-sm font-semibold text-fg-2 [&_th]:bg-surface [&_th:first-child]:rounded-tl-xl [&_th:last-child]:rounded-tr-xl">
                  <tr>
                    <th className="px-4 py-3">Project</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-surface [&:last-child>td:first-child]:rounded-bl-xl [&:last-child>td:last-child]:rounded-br-xl">
                      <td className="px-4 py-3 font-medium text-fg">{invoice.projectName}</td>
                      <td className="px-4 py-3 text-sm text-fg-2">{formatAmount(invoice.amountCents, invoice.currency)}</td>
                      <td className="px-4 py-3 text-sm text-fg-2">{DATE_FORMATTER.format(new Date(invoice.date))}</td>
                      <td className="px-4 py-3 text-sm text-fg-2">{invoice.status}</td>
                      <td className="px-4 py-3">
                        {(() => {
                          const action = getInvoiceAction(invoice);

                          if (!action.href) {
                            return <span className="text-fg-3">Unavailable</span>;
                          }

                          return (
                            <a
                              href={action.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="portal-btn-secondary whitespace-nowrap"
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
            </div>
          </section>
        ) : null}
      </main>
    </PageShell>
  );
}

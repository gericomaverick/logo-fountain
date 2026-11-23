<?php

namespace App\Support\Stripe;

/** `StripeInvoiceDocument` (`lib/client-invoices.ts:11-17`). `source` is `invoice`, `receipt` or `none`. */
final readonly class InvoiceDocument
{
    public function __construct(
        public ?string $invoiceId = null,
        public ?string $invoicePdfUrl = null,
        public ?string $hostedInvoiceUrl = null,
        public ?string $receiptUrl = null,
        public string $source = 'none',
    ) {}

    public static function none(): self
    {
        return new self;
    }

    /** `invoicePdfUrl ?? hostedInvoiceUrl ?? receiptUrl` (`invoices/route.ts:68`). */
    public function downloadUrl(): ?string
    {
        return $this->invoicePdfUrl ?? $this->hostedInvoiceUrl ?? $this->receiptUrl;
    }
}

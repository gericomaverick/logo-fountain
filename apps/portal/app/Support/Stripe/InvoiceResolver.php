<?php

namespace App\Support\Stripe;

use Illuminate\Support\Facades\Log;
use Stripe\StripeClient;
use Throwable;

/**
 * K-11: which Stripe document an order shows (`lib/client-invoices.ts:1-177`). Settled orders prefer the paid-safe
 * receipt, never a hosted (draft-looking) invoice link. Any Stripe failure yields no document; the message is logged
 * and never reaches the caller (AC 8). Pure given a Stripe client: no database.
 */
final class InvoiceResolver
{
    public function __construct(private readonly StripeClient $stripe) {}

    public function resolve(?string $sessionId, ?string $paymentIntentId, bool $isOrderSettled): InvoiceDocument
    {
        $sessionId = self::trimmed($sessionId);
        $paymentIntentId = self::trimmed($paymentIntentId);

        try {
            if ($sessionId !== null) {
                $found = $this->fromSession($sessionId, $isOrderSettled);
                if ($found !== null) {
                    return $found;
                }
            }
            if ($paymentIntentId !== null) {
                $found = $this->fromPaymentIntent($paymentIntentId, $isOrderSettled);
                if ($found !== null) {
                    return $found;
                }
            }
        } catch (Throwable $e) {
            Log::error('Failed to resolve Stripe invoice document', ['sessionId' => $sessionId, 'paymentIntentId' => $paymentIntentId, 'error' => $e->getMessage()]);
        }

        return InvoiceDocument::none();
    }

    private function fromSession(string $sessionId, bool $settled): ?InvoiceDocument
    {
        $session = $this->stripe->checkout->sessions->retrieve($sessionId, ['expand' => ['invoice', 'payment_intent.latest_charge']])->toArray();

        $intent = is_array($session['payment_intent'] ?? null) ? $session['payment_intent'] : null;
        $charge = is_array($intent['latest_charge'] ?? null) ? $intent['latest_charge'] : null;

        $receipt = self::receipt($charge['receipt_url'] ?? null);
        if ($settled && $receipt !== null) {
            return $receipt;
        }

        $invoice = $session['invoice'] ?? null;
        $doc = self::fromInvoiceObject($invoice, $settled);
        if ($doc !== null) {
            return $doc;
        }
        if (is_string($invoice) && $invoice !== '') {
            $doc = $this->byId($invoice, $settled);
            if ($doc !== null) {
                return $doc;
            }
        }

        return $this->fromCharge($charge, $settled) ?? $receipt;
    }

    private function fromPaymentIntent(string $id, bool $settled): ?InvoiceDocument
    {
        $intent = $this->stripe->paymentIntents->retrieve($id, ['expand' => ['latest_charge']])->toArray();
        $charge = $intent['latest_charge'] ?? null;
        if (! is_array($charge)) {
            return null;
        }
        $receipt = self::receipt($charge['receipt_url'] ?? null);
        if ($settled && $receipt !== null) {
            return $receipt;
        }

        return $this->fromCharge($charge, $settled) ?? $receipt;
    }

    /** @param  array<string, mixed>|null  $charge */
    private function fromCharge(?array $charge, bool $settled): ?InvoiceDocument
    {
        $invoice = $charge['invoice'] ?? null;
        if (is_string($invoice) && $invoice !== '') {
            return $this->byId($invoice, $settled);
        }

        return self::fromInvoiceObject($invoice, $settled);
    }

    /** An expanded invoice that passes the settled test and has the links this order may show (`:57-63,121-135`). */
    private static function fromInvoiceObject(mixed $invoice, bool $settled): ?InvoiceDocument
    {
        if (! is_array($invoice) || ! is_string($invoice['id'] ?? null) || ($settled && ! self::isSettled($invoice))) {
            return null;
        }
        $pdf = self::url($invoice['invoice_pdf'] ?? null);
        $hosted = self::url($invoice['hosted_invoice_url'] ?? null);

        if ($settled) { // the hosted link is always dropped; a PDF is required (`:41-55`)
            return $pdf === null ? null : new InvoiceDocument($invoice['id'], $pdf, null, null, 'invoice');
        }

        return $pdf !== null || $hosted !== null ? new InvoiceDocument($invoice['id'], $pdf, $hosted, null, 'invoice') : null;
    }

    private function byId(string $invoiceId, bool $settled): ?InvoiceDocument
    {
        return self::fromInvoiceObject($this->stripe->invoices->retrieve($invoiceId)->toArray(), $settled);
    }

    /**
     * `:23-27`.
     *
     * @param  array<string, mixed>  $invoice
     */
    private static function isSettled(array $invoice): bool
    {
        if (($invoice['status'] ?? null) === 'paid') {
            return true;
        }
        if (is_numeric($invoice['amount_remaining'] ?? null) && $invoice['amount_remaining'] > 0) {
            return false;
        }
        $transitions = $invoice['status_transitions'] ?? null;

        return is_array($transitions) && ! empty($transitions['paid_at']);
    }

    private static function receipt(mixed $url): ?InvoiceDocument
    {
        $url = self::url($url);

        return $url === null ? null : new InvoiceDocument(null, null, null, $url, 'receipt');
    }

    private static function url(mixed $value): ?string
    {
        return is_string($value) && trim($value) !== '' ? $value : null;
    }

    private static function trimmed(?string $value): ?string
    {
        $value = trim((string) $value);

        return $value === '' ? null : $value;
    }
}

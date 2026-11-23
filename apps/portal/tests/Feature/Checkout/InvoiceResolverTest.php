<?php

use App\Support\Stripe\InvoiceResolver;
use Illuminate\Support\Facades\Log;
use Stripe\StripeClient;
use Tests\Support\FakeStripe;

// Story 5.7 (K-11; AC 3-9): one case per branch of `lib/client-invoices.ts`, answered by the in-process Stripe fake.
afterEach(fn () => FakeStripe::uninstall());

const IV_PDF = 'https://pay.stripe.test/in_1/pdf';
const IV_HOSTED = 'https://pay.stripe.test/in_1';
const IV_RECEIPT = 'https://pay.stripe.test/receipts/r1';
const IV_NONE = ['none', null, null, null, null];
const IV_PDF_ONLY = ['invoice', 'in_1', IV_PDF, null, null];
const IV_RECEIPT_ONLY = ['receipt', null, null, null, IV_RECEIPT];

function ivInvoice(array $over = []): array
{
    return $over + ['id' => 'in_1', 'object' => 'invoice', 'status' => 'paid', 'amount_remaining' => 0, 'invoice_pdf' => IV_PDF, 'hosted_invoice_url' => IV_HOSTED];
}

function ivSession(?array $invoice = null, ?string $receipt = null, array|string|null $chargeInvoice = null, ?string $sessionInvoiceId = null): array
{
    $charge = ['id' => 'ch_1', 'object' => 'charge', 'receipt_url' => $receipt, 'invoice' => $chargeInvoice];

    return ['id' => 'cs_1', 'object' => 'checkout.session', 'invoice' => $invoice ?? $sessionInvoiceId, 'payment_intent' => ['id' => 'pi_1', 'object' => 'payment_intent', 'latest_charge' => $charge]];
}

function ivIntent(array|string $charge): array
{
    return ['id' => 'pi_9', 'object' => 'payment_intent', 'latest_charge' => $charge];
}

dataset('invoice cases', function () {
    $open = ['status' => 'open', 'amount_remaining' => 500];

    return [
        'settled: the charge receipt wins over a paid invoice (AC 5)' => [true, [ivSession(ivInvoice(), IV_RECEIPT)], 'cs_1', null, IV_RECEIPT_ONLY, 1],
        'settled: expanded paid invoice, hosted link dropped' => [true, [ivSession(ivInvoice())], 'cs_1', null, IV_PDF_ONLY, 1],
        'settled: string session invoice is retrieved' => [true, [ivSession(null, null, null, 'in_1'), ivInvoice()], 'cs_1', null, IV_PDF_ONLY, 2],
        'settled: an open invoice is refused, then the charge invoice by id' => [true, [ivSession(ivInvoice($open), null, 'in_2'), ivInvoice(['id' => 'in_2', 'invoice_pdf' => 'https://pay.stripe.test/in_2/pdf'])], 'cs_1', null, ['invoice', 'in_2', 'https://pay.stripe.test/in_2/pdf', null, null], 2],
        'settled: charge invoice object paid by a transition, nothing remaining' => [true, [ivSession(null, null, ivInvoice(['status' => 'open', 'status_transitions' => ['paid_at' => 1700000000]]))], 'cs_1', null, IV_PDF_ONLY, 1],
        'settled: a paid invoice with no PDF yields nothing' => [true, [ivSession(ivInvoice(['invoice_pdf' => null]))], 'cs_1', null, IV_NONE, 1],
        'settled: money remaining is not settled even with a paid_at' => [true, [ivSession(ivInvoice(['status' => 'open', 'amount_remaining' => 100, 'status_transitions' => ['paid_at' => 1700000000]]))], 'cs_1', null, IV_NONE, 1],
        'unsettled: PDF and hosted link both kept' => [false, [ivSession(ivInvoice($open))], 'cs_1', null, ['invoice', 'in_1', IV_PDF, IV_HOSTED, null], 1],
        'unsettled: hosted link alone is accepted' => [false, [ivSession(ivInvoice(['status' => 'open', 'invoice_pdf' => null]))], 'cs_1', null, ['invoice', 'in_1', null, IV_HOSTED, null], 1],
        'unsettled: receipt only, after no invoice' => [false, [ivSession(null, IV_RECEIPT)], 'cs_1', null, IV_RECEIPT_ONLY, 1],
        'session with nothing falls through to the payment intent' => [true, [ivSession(), ivIntent(['id' => 'ch_9', 'object' => 'charge', 'receipt_url' => IV_RECEIPT])], 'cs_1', 'pi_9', IV_RECEIPT_ONLY, 2],
        'payment intent only: settled receipt first' => [true, [ivIntent(['id' => 'ch_9', 'object' => 'charge', 'receipt_url' => IV_RECEIPT, 'invoice' => ivInvoice()])], null, 'pi_9', IV_RECEIPT_ONLY, 1],
        'payment intent only: charge invoice object, unsettled' => [false, [ivIntent(['id' => 'ch_9', 'object' => 'charge', 'invoice' => ivInvoice(['status' => 'open'])])], null, 'pi_9', ['invoice', 'in_1', IV_PDF, IV_HOSTED, null], 1],
        'payment intent only: charge invoice by id' => [true, [ivIntent(['id' => 'ch_9', 'object' => 'charge', 'invoice' => 'in_1']), ivInvoice()], null, 'pi_9', IV_PDF_ONLY, 2],
        'payment intent with an unexpanded charge yields nothing' => [true, [ivIntent('ch_9')], null, 'pi_9', IV_NONE, 1],
        'DV-25 free order: no payment intent, no invoice, nothing to show' => [true, [['id' => 'cs_1', 'object' => 'checkout.session', 'invoice' => null, 'payment_intent' => null]], 'cs_1', null, IV_NONE, 1],
        'DV-25 free order: a zero-value paid invoice still resolves to its PDF' => [true, [['id' => 'cs_1', 'object' => 'checkout.session', 'payment_intent' => null, 'invoice' => ivInvoice(['amount_due' => 0, 'total' => 0])]], 'cs_1', null, IV_PDF_ONLY, 1],
        'blank ids make no call' => [true, [], '  ', '', IV_NONE, 0],
    ];
});

it('chooses the same document as Next', function (bool $settled, array $responses, ?string $session, ?string $intent, array $want, int $calls) {
    $fake = FakeStripe::install();
    foreach ($responses as $body) {
        $fake->respondWith(200, $body);
    }

    $doc = (new InvoiceResolver(app(StripeClient::class)))->resolve($session, $intent, $settled);

    expect([$doc->source, $doc->invoiceId, $doc->invoicePdfUrl, $doc->hostedInvoiceUrl, $doc->receiptUrl])->toBe($want)
        ->and($fake->requests)->toHaveCount($calls);
})->with('invoice cases')->group('invoices', 'api');

it('returns no document on any Stripe error, and logs only the message (AC 8)', function () {
    Log::spy();
    $fake = FakeStripe::install()->failWith('No such checkout session: cs_gone');

    $doc = (new InvoiceResolver(app(StripeClient::class)))->resolve('cs_gone', 'pi_1', true);

    expect($doc->source)->toBe('none')->and($doc->downloadUrl())->toBeNull()->and($fake->requests)->toHaveCount(1);
    Log::shouldHaveReceived('error')->once()->withArgs(fn ($m, $ctx) => $m === 'Failed to resolve Stripe invoice document' && $ctx['error'] === 'No such checkout session: cs_gone' && array_keys($ctx) === ['sessionId', 'paymentIntentId', 'error']);
})->group('invoices', 'api');

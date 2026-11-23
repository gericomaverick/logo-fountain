<?php

namespace App\Actions\Checkout;

use App\Domain\CanonicalOrigin;
use App\Domain\PublicSiteUrlRequired;
use App\Exceptions\ApiException;
use App\Support\ErrorCodes;
use App\Support\Stripe\StripeCatalog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Stripe\Exception\ApiErrorException;
use Stripe\StripeClient;
use Throwable;

/**
 * K-01 / K-13: create one Checkout Session for a package and return Stripe's hosted URL
 * (`app/checkout/start/route.ts:19-71`). Deviations: DV-1 (promotion codes), DV-5 (canonical URLs, never the
 * request's headers), DV-20 (a fixed 500 message; Stripe's text goes to the log only).
 */
final readonly class StartCheckout
{
    public const INVALID_PACKAGE_MESSAGE = 'Invalid package_code. Expected one of: essential, professional, complete';

    public const FAILED_MESSAGE = 'Unable to create checkout session';

    public function __construct(private StripeCatalog $catalog) {}

    /**
     * @return string the Stripe-hosted checkout URL
     *
     * @throws ApiException
     */
    public function __invoke(Request $request, ?string $packageCode, ?string $campaignSlug): string
    {
        $priceId = $this->catalog->priceIdForPackage($packageCode);
        if ($packageCode === null || $priceId === null) {
            throw new ApiException(self::INVALID_PACKAGE_MESSAGE, 400, ErrorCodes::INVALID_PACKAGE);
        }

        try {
            $origin = CanonicalOrigin::fromConfig()->resolve($request);
        } catch (PublicSiteUrlRequired $e) {
            throw new ApiException($e->getMessage(), 503, PublicSiteUrlRequired::CODE);
        }

        try {
            /** @var array<string, mixed> $params */
            $params = [
                'mode' => 'payment',
                'customer_creation' => 'always',
                'billing_address_collection' => 'auto',
                'phone_number_collection' => ['enabled' => false],
                'allow_promotion_codes' => true, // DV-1
                'success_url' => $origin.'/checkout/success?session_id={CHECKOUT_SESSION_ID}',
                'cancel_url' => $this->cancelOrigin($origin).'/#packages',
                'line_items' => [['price' => $priceId, 'quantity' => 1]],
                'invoice_creation' => ['enabled' => true],
                'custom_fields' => [
                    self::nameField('first_name', 'First name'),
                    self::nameField('last_name', 'Last name'),
                ],
                'metadata' => ['package_code' => $packageCode] + ($campaignSlug === null ? [] : ['campaign_slug' => $campaignSlug]),
            ];
            // @phpstan-ignore argument.type (stripe-php's generated param shape is stricter than the array we build)
            $session = app(StripeClient::class)->checkout->sessions->create($params);
        } catch (Throwable $e) {
            // DV-20: the detail is for the log (the scrubber redacts secrets), never the caller. Stripe errors carry no body here.
            Log::error('Stripe checkout session creation failed', [
                'exception' => $e::class,
                'message' => $e->getMessage(),
                'stripeCode' => $e instanceof ApiErrorException ? $e->getStripeCode() : null,
            ]);

            throw new ApiException(self::FAILED_MESSAGE, 500, ErrorCodes::CHECKOUT_SESSION_FAILED, ['nextStep' => 'Verify Stripe configuration and retry.']);
        }

        $url = $session->url;
        if (! is_string($url) || $url === '') {
            throw new ApiException('Failed to create checkout session URL', 500, ErrorCodes::CHECKOUT_URL_MISSING);
        }

        return $url;
    }

    /** `getConfiguredMarketingSiteOrigin() ?? origin` (`route.ts:28`): the marketing origin, else the canonical one. */
    private function cancelOrigin(string $canonical): string
    {
        $configured = config('portal.public_marketing_site_url');
        $parsed = is_string($configured) && trim($configured) !== '' ? CanonicalOrigin::parse($configured) : null;

        return $parsed['origin'] ?? $canonical;
    }

    /** @return array<string, mixed> */
    private static function nameField(string $key, string $label): array
    {
        return [
            'key' => $key,
            'label' => ['type' => 'custom', 'custom' => $label],
            'type' => 'text',
            'text' => ['minimum_length' => 1, 'maximum_length' => 80],
            'optional' => false,
        ];
    }
}

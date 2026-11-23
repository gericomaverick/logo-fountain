<?php

namespace App\Actions\Checkout;

use App\Domain\CanonicalOrigin;
use App\Domain\PublicSiteUrlRequired;
use App\Exceptions\ApiException;
use App\Models\Project;
use App\Support\ErrorCodes;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Stripe\StripeClient;
use Throwable;

/**
 * K-08 (`api/projects/[id]/checkout/session/route.ts`): one Checkout Session for an add-on or an upgrade on a project
 * the caller is a member of. Guard order as Next: membership (the caller's policy), body, kind, then the kind's own
 * checks. DV-1 promotion codes, DV-5 canonical URLs, DV-20 fixed 500 message.
 */
final readonly class StartUpsellCheckout
{
    /** @param array<string, mixed> $body */
    public function __invoke(Request $request, Project $project, array $body): string
    {
        $kind = $body['kind'] ?? null;
        if ($kind !== 'addon' && $kind !== 'upgrade') {
            throw new ApiException("Invalid kind. Expected 'addon' or 'upgrade'", 400, ErrorCodes::INVALID_KIND);
        }

        if ($kind === 'addon') {
            if (($body['addonKey'] ?? null) !== 'extra_revision') {
                throw new ApiException("Invalid addonKey. Expected 'extra_revision'", 400, ErrorCodes::INVALID_ADDON_KEY);
            }
            $priceId = self::priceId('extra_revision');
            if ($priceId === null) {
                throw new ApiException('Stripe price not configured for extra revision', 500, ErrorCodes::PRICE_NOT_CONFIGURED);
            }
            $metadata = ['kind' => 'addon', 'projectId' => $project->id, 'addonKey' => 'extra_revision', 'fromPackage' => $project->package_code];
        } else {
            $from = PackageEntitlements::tierLimit($project->package_code) !== null ? $project->package_code : null;
            $toRaw = $body['toPackage'] ?? null;
            $to = is_string($toRaw) && PackageEntitlements::tierLimit($toRaw) !== null ? $toRaw : null;
            if ($from === null || $to === null) {
                throw new ApiException('Invalid package transition', 400, ErrorCodes::INVALID_UPGRADE_PATH);
            }
            $priceId = self::priceId("{$from}->{$to}");
            if ($priceId === null) {
                throw new ApiException('Unsupported upgrade path', 400, ErrorCodes::UNSUPPORTED_UPGRADE_PATH);
            }
            $metadata = ['kind' => 'upgrade', 'projectId' => $project->id, 'fromPackage' => $from, 'toPackage' => $to];
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
                'allow_promotion_codes' => true, // DV-1
                'success_url' => "{$origin}/project/{$project->id}?upsell=1&kind={$kind}&session_id={CHECKOUT_SESSION_ID}", // DV-5
                'cancel_url' => "{$origin}/project/{$project->id}",
                'line_items' => [['price' => $priceId, 'quantity' => 1]],
                'metadata' => $metadata,
            ];
            // @phpstan-ignore argument.type (stripe-php's generated param shape is stricter than the array we build)
            $session = app(StripeClient::class)->checkout->sessions->create($params);
        } catch (Throwable $e) {
            Log::error('Stripe upsell session creation failed', ['exception' => $e::class, 'message' => $e->getMessage()]);

            throw new ApiException(StartCheckout::FAILED_MESSAGE, 500, ErrorCodes::CHECKOUT_SESSION_FAILED, ['nextStep' => 'Verify Stripe configuration and retry.']);
        }
        $url = $session->url;
        if (! is_string($url) || $url === '') {
            throw new ApiException('Failed to create checkout session URL', 500, ErrorCodes::CHECKOUT_URL_MISSING);
        }

        return $url;
    }

    private static function priceId(string $key): ?string
    {
        $id = config("catalog.upsells.{$key}.price_id");

        return is_string($id) && $id !== '' && ! str_contains(strtoupper($id), 'REPLACE') ? $id : null;
    }
}

<?php

namespace App\Http\Controllers\Api;

use App\Actions\Checkout\StartCheckout;
use App\Http\Controllers\Controller;
use App\Support\NodeCompat;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

/** K-01: `GET /checkout/start`, public and anonymous (`app/checkout/start/route.ts`). No session is read or started. */
final class CheckoutStartController extends Controller
{
    public function __invoke(Request $request, StartCheckout $start): RedirectResponse
    {
        // `searchParams.get`: the first occurrence, from the raw query string. TrimStrings has already trimmed the
        // request's own bag, which would accept " complete" where Next rejects it.
        $package = self::rawQuery($request, 'package_code');

        // `parseCampaignSlug` (`route.ts:12-16`): trimmed (JS rules), empty omitted, cut to 80 UTF-16 units.
        $slug = NodeCompat::trimEnv(self::rawQuery($request, 'campaign_slug') ?? '');
        $slug = $slug === '' ? null : NodeCompat::slice($slug, 80);

        return redirect()->away($start($request, $package, $slug), 303);
    }

    private static function rawQuery(Request $request, string $name): ?string
    {
        $server = $request->server->get('QUERY_STRING');
        $raw = is_string($server) ? $server : '';
        foreach (explode('&', $raw) as $pair) {
            [$key, $value] = array_pad(explode('=', $pair, 2), 2, '');
            if (urldecode($key) === $name) {
                return urldecode($value);
            }
        }

        return null;
    }
}

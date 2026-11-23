<?php

namespace App\Actions\Checkout;

use App\Support\NodeCompat;
use Stripe\StripeClient;

/**
 * What fulfilment reads out of a Checkout Session array (`checkout-fulfillment.ts:63-67,85-98,102-127,153-170`).
 * `normalizeText` is a JS trim, empty → null; the purchaser email is trimmed and lowercased.
 */
final class CheckoutSessionData
{
    public static function text(mixed $value): ?string
    {
        if (! is_string($value) || $value === '') {
            return null;
        }
        $trimmed = NodeCompat::trimEnv($value);

        return $trimmed === '' ? null : $trimmed;
    }

    public static function email(mixed $value): ?string
    {
        $text = self::text($value);

        return $text === null ? null : NodeCompat::lower($text);
    }

    /** @param array<string, mixed> $session */
    private static function customerDetail(array $session, string $key): mixed
    {
        $details = $session['customer_details'] ?? null;

        return is_array($details) ? ($details[$key] ?? null) : null;
    }

    /**
     * @param  array<string, mixed>  $session
     * @return array{first: ?string, last: ?string, full: ?string}
     */
    public static function names(array $session): array
    {
        $field = function (string $key) use ($session): ?string {
            foreach (is_array($session['custom_fields'] ?? null) ? $session['custom_fields'] : [] as $f) {
                if (is_array($f) && ($f['key'] ?? null) === $key && ($f['type'] ?? null) === 'text') {
                    return self::text(is_array($f['text'] ?? null) ? ($f['text']['value'] ?? null) : null);
                }
            }

            return null;
        };
        $first = $field('first_name');
        $last = $field('last_name');
        $full = self::text(implode(' ', array_filter([$first, $last], fn ($p) => $p !== null))) ?? self::text(self::customerDetail($session, 'name'));

        return ['first' => $first, 'last' => $last, 'full' => $full];
    }

    /** @param array<string, mixed> $session */
    public static function clientName(array $session): string
    {
        $full = self::names($session)['full'] ?? self::text(self::customerDetail($session, 'name'));
        if ($full !== null) {
            return $full;
        }
        $email = self::customerDetail($session, 'email');
        $local = explode('@', is_string($email) ? NodeCompat::trimEnv($email) : '')[0];

        return $local !== '' ? $local : 'Logo Fountain Client';
    }

    /** `purchaserEmailFromSession`: customer_details, then an expanded customer, then the customer fetched by id.
     *
     * @param  array<string, mixed>  $session
     */
    public static function purchaserEmail(array $session, StripeClient $stripe): ?string
    {
        $fromDetails = self::email(self::customerDetail($session, 'email'));
        if ($fromDetails !== null) {
            return $fromDetails;
        }
        $customer = $session['customer'] ?? null;
        if (is_array($customer)) {
            $expanded = self::email($customer['email'] ?? null);
            if ($expanded !== null) {
                return $expanded;
            }
        }
        if (is_string($customer) && $customer !== '') {
            $fetched = $stripe->customers->retrieve($customer)->toArray();

            return ($fetched['deleted'] ?? false) === true ? null : self::email($fetched['email'] ?? null);
        }

        return null;
    }

    public static function slug(string $input): string
    {
        $slug = trim((string) preg_replace('/[^a-z0-9]+/', '-', mb_strtolower($input)), '-');

        return substr($slug, 0, 48);
    }
}

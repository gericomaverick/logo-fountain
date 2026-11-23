<?php

namespace Tests\Support;

use Stripe\ApiRequestor;
use Stripe\HttpClient\ClientInterface;
use Stripe\StripeClient;

/**
 * An in-process stand-in for stripe-fake (`tests/parity/infra/stripe-fake`) for Pest: it takes the place of
 * stripe-php's HTTP client, so no request leaves the process and no live key is needed (test mode and fakes only).
 * It records every call (method, path, decoded params) and answers Checkout Session creation like the fake does.
 */
final class FakeStripe implements ClientInterface
{
    /** @var list<array{method: string, path: string, params: array<string, mixed>}> */
    public array $requests = [];

    /** @var list<array{int, array<string, mixed>}> queued responses; empty means the default answer */
    private array $queue = [];

    public static function install(): self
    {
        $fake = new self;
        ApiRequestor::setHttpClient($fake);
        config(['services.stripe.secret' => 'sk_test_'.str_repeat('a', 24), 'services.stripe.api_base' => 'http://stripe-fake.test']);
        app()->forgetInstance(StripeClient::class);

        return $fake;
    }

    public static function uninstall(): void
    {
        ApiRequestor::setHttpClient(null);
    }

    /** @param  array<string, mixed>  $body */
    public function respondWith(int $status, array $body): self
    {
        $this->queue[] = [$status, $body];

        return $this;
    }

    public function failWith(string $message): self
    {
        return $this->respondWith(400, ['error' => ['type' => 'invalid_request_error', 'message' => $message, 'code' => 'resource_missing']]);
    }

    /** @return array<string, mixed> the params of the one recorded call */
    public function onlyParams(): array
    {
        expect($this->requests)->toHaveCount(1);

        return $this->requests[0]['params'];
    }

    public function request($method, $absUrl, $headers, $params, $hasFile, $apiMode = 'v1', $maxNetworkRetries = null)
    {
        $path = (string) parse_url((string) $absUrl, PHP_URL_PATH);
        /** @var array<string, mixed> $params */
        $params = is_array($params) ? $params : [];
        $this->requests[] = ['method' => strtoupper((string) $method), 'path' => $path, 'params' => $params];

        [$status, $body] = array_shift($this->queue) ?? [200, [
            'id' => 'cs_test_fake_1',
            'object' => 'checkout.session',
            'livemode' => false,
            'mode' => 'payment',
            'url' => 'https://checkout.stripe.test/c/pay/cs_test_fake_1',
        ]];

        return [json_encode($body, JSON_THROW_ON_ERROR), $status, ['Request-Id' => 'req_fake']];
    }
}

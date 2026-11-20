<?php

// Portal settings (O-07, story 1.3). Architecture §5: env vars are read only in config/*.php.
// Validated at runtime by App\Domain\CanonicalOrigin and App\Support\AuthProxyConfig, at boot by
// App\Providers\ConfigValidationServiceProvider, and before a deploy by `php artisan proxy:preflight`.

return [

    // X-04: the canonical origin for the Origin guard and every emailed link. Must be https in
    // production. Unset outside production → the request's own origin, loopback hosts only.
    'public_site_url' => env('PUBLIC_SITE_URL'),

    // Checkout cancel URL (`{origin}/#packages`, K-01).
    'public_marketing_site_url' => env('PUBLIC_MARKETING_SITE_URL'),

    // A-17 / X-05 (ADR-010): set exactly one. Production auth answers 503 AUTH_UNAVAILABLE otherwise.
    'auth_client_ip_header' => env('AUTH_CLIENT_IP_HEADER'),
    'auth_trusted_proxy_hops' => env('AUTH_TRUSTED_PROXY_HOPS'),

    // Notification recipients only, never authorisation (comma-separated).
    'admin_notification_emails' => env('ADMIN_NOTIFICATION_EMAILS'),

    // Email branding logo (https), otherwise `{PUBLIC_SITE_URL}/img/logo.svg`.
    'email_logo_url' => env('EMAIL_LOGO_URL'),

    // Private object storage (ADR-016: the AWS SDK directly). The endpoint is a local/test seam.
    'r2' => [
        'account_id' => env('R2_ACCOUNT_ID'),
        'access_key_id' => env('R2_ACCESS_KEY_ID'),
        'secret_access_key' => env('R2_SECRET_ACCESS_KEY'),
        'concepts_bucket' => env('R2_CONCEPTS_BUCKET'),
        'final_deliverables_bucket' => env('R2_FINAL_DELIVERABLES_BUCKET'),
        'jurisdiction' => env('R2_JURISDICTION'),
        'endpoint' => env('R2_ENDPOINT'),
    ],

];

<?php

use App\Actions\Checkout\FulfilCheckout;
use App\Actions\Checkout\ProvisionAccess;
use App\Support\DatabaseRoles;
use Illuminate\Support\Facades\DB;
use Tests\Support\FakeStripe;
use Tests\Support\RaceChildren;
use Tests\Support\TruncatesDatabaseAsOwner;

// Story 5.3 AC 9 (N-01, N-10; critic B4): the webhook and a second delivery (or a reprocess) run the side effects of
// one session at the same moment. The session-keyed advisory lock makes the second see the marker: each mail once.
uses(TruncatesDatabaseAsOwner::class);

afterEach(function () {
    FakeStripe::uninstall();
    DB::disconnect(DatabaseRoles::RUNTIME);
    DB::disconnect(DatabaseRoles::MIGRATE);
});

it('sends the customer and admin email once when the side effects race', function () {
    config(['mail.default' => 'array', 'mail.from.address' => 'from@example.test']);
    $stripe = FakeStripe::install();
    $stripe->respondWith(200, ['object' => 'list', 'has_more' => false, 'url' => '/x', 'data' => [['id' => 'li_1', 'object' => 'item', 'price' => ['id' => config('catalog.packages.essential.price_id')]]]]);
    $session = ['id' => 'cs_test_RACE0001', 'payment_status' => 'paid', 'currency' => 'gbp', 'amount_total' => 100, 'payment_intent' => 'pi_race',
        'customer_details' => ['email' => 'race@example.test', 'name' => 'Race Buyer'], 'metadata' => []];
    $result = app(FulfilCheckout::class)->fulfil($session);
    $access = app(ProvisionAccess::class)->handle($result->clientId, 'race@example.test', 'Race', 'Buyer');

    $children = RaceChildren::run('side-effects', 6, ['cs_test_RACE0001', $result->projectId, $access->userId], ['ADMIN_NOTIFICATION_EMAILS' => 'ops@example.test', 'POSTMARK_FROM' => 'from@example.test']);

    $subjects = array_merge(...array_map(fn (array $c) => $c['subjects'], $children));
    expect($subjects)->toHaveCount(2) // one customer auth link, one admin "New project created"
        ->and(DB::table('audit_events')->where('type', 'email_sent:checkout_auth:cs_test_RACE0001')->count())->toBe(1)
        ->and(DB::table('audit_events')->where('type', 'email_sent:admin_new_project')->count())->toBe(1)
        ->and(DB::table('auth_proofs')->count())->toBe(1);
})->group('pg-race');

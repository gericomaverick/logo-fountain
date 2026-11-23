<?php

use App\Models\ClientMembership;
use App\Models\Profile;
use App\Models\Project;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Tests\Support\FakeStripe;
use Tests\Support\SessionRows;
use Tests\Support\TruncatesDatabaseAsOwner;

uses(TruncatesDatabaseAsOwner::class);

// Story 5.5 (K-08; DV-1, DV-5, DV-20): `POST /api/projects/{id}/checkout/session`. Stripe is the in-process fake.
const UPS_ORIGIN = 'https://app.example.com';
const UPS_SID = 'ucdefghijabcdefghijabcdefghijabcdefghij1';

beforeEach(function () {
    config(['session.driver' => 'database', 'portal.public_site_url' => UPS_ORIGIN]);
});
afterEach(fn () => FakeStripe::uninstall());

/** @return array{0: Project, 1: User} a member signed in on UPS_SID */
function upsMember(string $package = 'essential'): array
{
    $project = Project::factory()->create(['package_code' => $package]);
    $user = ClientMembership::factory()->create(['client_id' => $project->client_id])->profile->user;
    SessionRows::insert(UPS_SID, $user->id, time(), time(), true);

    return [$project, $user];
}

function upsPost(string $projectId, array|string $body, bool $signedIn = true): TestResponse
{
    $t = test()->withHeaders(['Origin' => UPS_ORIGIN]);
    if ($signedIn) {
        $t = $t->withCredentials()->withCookie(config('session.cookie'), UPS_SID);
    }

    return is_array($body) ? $t->postJson("/api/projects/{$projectId}/checkout/session", $body)
        : $t->call('POST', "/api/projects/{$projectId}/checkout/session", [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_ORIGIN' => UPS_ORIGIN], $body);
}

it('creates an add-on session with promotion codes, canonical URLs and the project metadata', function () {
    [$project] = upsMember();
    $fake = FakeStripe::install();
    upsPost($project->id, ['kind' => 'addon', 'addonKey' => 'extra_revision'])->assertOk()->assertJsonStructure(['url']);

    $params = $fake->onlyParams();
    expect($params['allow_promotion_codes'])->toBe('true') // DV-1
        ->and($params['success_url'])->toBe(UPS_ORIGIN."/project/{$project->id}?upsell=1&kind=addon&session_id={CHECKOUT_SESSION_ID}") // DV-5
        ->and($params['cancel_url'])->toBe(UPS_ORIGIN."/project/{$project->id}")
        ->and($params['line_items'][0]['price'])->toBe(config('catalog.upsells.extra_revision.price_id'))
        ->and($params['metadata'])->toBe(['kind' => 'addon', 'projectId' => $project->id, 'addonKey' => 'extra_revision', 'fromPackage' => 'essential']);
})->group('upsell', 'api', 'deviation');

it('creates an upgrade session for the next step up', function () {
    [$project] = upsMember('professional');
    $fake = FakeStripe::install();
    upsPost($project->id, ['kind' => 'upgrade', 'toPackage' => 'complete'])->assertOk();
    $params = $fake->onlyParams();
    expect($params['line_items'][0]['price'])->toBe(config('catalog.upsells.professional->complete.price_id'))
        ->and($params['metadata'])->toBe(['kind' => 'upgrade', 'projectId' => $project->id, 'fromPackage' => 'professional', 'toPackage' => 'complete'])
        ->and($params['success_url'])->toContain('kind=upgrade');
})->group('upsell', 'api');

it('guards in order: 401, 404 for a non-member, 400 bad JSON, then the kind rules', function () {
    [$project] = upsMember();
    FakeStripe::install();
    upsPost($project->id, ['kind' => 'addon'], false)->assertStatus(401)->assertJsonPath('error.code', 'UNAUTHORIZED');
    upsPost('00000000-0000-4000-8000-000000000000', ['kind' => 'addon'])->assertStatus(404)->assertJsonPath('error.code', 'PROJECT_NOT_FOUND');
    upsPost('not-a-uuid', ['kind' => 'addon'])->assertStatus(404);
    upsPost($project->id, '{nope')->assertStatus(400)->assertJsonPath('error.code', 'INVALID_JSON');
    upsPost($project->id, ['kind' => 'bundle'])->assertStatus(400)->assertJsonPath('error.code', 'INVALID_KIND');
    upsPost($project->id, ['kind' => 'addon', 'addonKey' => 'x'])->assertStatus(400)->assertJsonPath('error.code', 'INVALID_ADDON_KEY');
    upsPost($project->id, ['kind' => 'upgrade', 'toPackage' => 'platinum'])->assertStatus(400)->assertJsonPath('error.code', 'INVALID_UPGRADE_PATH');
    upsPost($project->id, ['kind' => 'upgrade', 'toPackage' => 'complete'])->assertStatus(400)->assertJsonPath('error.code', 'UNSUPPORTED_UPGRADE_PATH'); // essential -> complete
    upsPost($project->id, ['kind' => 'upgrade', 'toPackage' => 'essential'])->assertStatus(400)->assertJsonPath('error.code', 'UNSUPPORTED_UPGRADE_PATH');
})->group('upsell', 'api');

it('answers 404 to a signed-in user who is not a member, whatever else they are', function () {
    [$project] = upsMember();
    $other = User::factory()->create();
    Profile::factory()->create(['id' => $other->id]); // the policy has no admin bypass: a non-member is a non-member
    DB::table('sessions')->where('id', UPS_SID)->delete();
    SessionRows::insert(UPS_SID, $other->id, time(), time(), true);
    FakeStripe::install();
    upsPost($project->id, ['kind' => 'addon', 'addonKey' => 'extra_revision'])->assertStatus(404)->assertJsonPath('error.code', 'PROJECT_NOT_FOUND');
})->group('upsell', 'api');

it('returns a fixed 500 message when Stripe fails, and 500 when no URL comes back (DV-20)', function () {
    [$project] = upsMember();
    FakeStripe::install()->failWith('secret detail from stripe');
    $r = upsPost($project->id, ['kind' => 'addon', 'addonKey' => 'extra_revision'])->assertStatus(500)->assertJsonPath('error.code', 'CHECKOUT_SESSION_FAILED');
    expect($r->getContent())->not->toContain('secret detail');
    FakeStripe::install()->respondWith(200, ['id' => 'cs_x', 'object' => 'checkout.session', 'url' => null]);
    upsPost($project->id, ['kind' => 'addon', 'addonKey' => 'extra_revision'])->assertStatus(500)->assertJsonPath('error.code', 'CHECKOUT_URL_MISSING');
})->group('upsell', 'api', 'deviation');

it('refuses a cross-origin POST before anything else', function () {
    [$project] = upsMember();
    test()->withHeaders(['Origin' => 'https://evil.example'])->withCredentials()->withCookie(config('session.cookie'), UPS_SID)
        ->postJson("/api/projects/{$project->id}/checkout/session", ['kind' => 'addon', 'addonKey' => 'extra_revision'])->assertStatus(403);
})->group('upsell', 'api');

<?php

use App\Actions\Auth\SendAuthLink;
use App\Jobs\SendAuthLinkMail;
use App\Models\Client;
use App\Models\Project;
use App\Models\ProjectOrder;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Illuminate\Testing\TestResponse;
use Tests\Support\TruncatesDatabaseAsOwner;

// Story 5.4 (K-02, K-03, K-04, FR58): status and send-link. Mail is the array/probe transport; nothing leaves the process.
uses(TruncatesDatabaseAsOwner::class);

function orderFor(string $session, string $status = 'FULFILLED', ?string $email = 'Buyer@Example.test'): ProjectOrder
{
    $client = Client::create(['name' => 'Acme', 'slug' => 'acme-'.$session, 'billing_email' => $email]);
    $project = Project::create(['client_id' => $client->id, 'status' => 'AWAITING_BRIEF', 'package_code' => 'complete']);

    return ProjectOrder::create(['project_id' => $project->id, 'client_id' => $client->id, 'status' => $status, 'currency' => 'gbp',
        'total_cents' => 100, 'stripe_checkout_session_id' => $session, 'stripe_payment_intent_id' => 'pi_'.$session]);
}

function sendLink(mixed $session): TestResponse
{
    return test()->withHeaders(['Origin' => 'https://app.example.com'])->postJson('/api/checkout/magic-link', ['session_id' => $session]);
}

beforeEach(function () {
    config(['portal.public_site_url' => 'https://app.example.com', 'mail.default' => 'array', 'mail.from.address' => 'from@example.test']);
});

it('status: 400 without a session id, and exactly two fields otherwise', function () {
    $this->getJson('/api/checkout/status')->assertStatus(400)
        ->assertJsonPath('error.code', 'MISSING_SESSION_ID')->assertJsonPath('error.message', 'Missing session_id')
        ->assertJsonPath('error.details.nextStep', 'Include session_id query param.');
    $this->getJson('/api/checkout/status?session_id=%20%20')->assertStatus(400);
    orderFor('cs_ok');
    $this->getJson('/api/checkout/status?session_id=cs_ok')->assertOk()->assertExactJson(['fulfilled' => true, 'status' => 'FULFILLED'])
        ->assertHeader('Cache-Control', 'no-store, private');
});

it('status: an unknown session and a pending or NEEDS_CONTACT order are byte-identical', function () {
    orderFor('cs_nc', 'NEEDS_CONTACT');
    orderFor('cs_pend', 'PENDING');
    $bodies = array_map(fn (string $id) => $this->getJson('/api/checkout/status?session_id='.$id)->assertOk()->getContent(), ['cs_unknown', 'cs_nc', 'cs_pend']);
    expect(array_unique($bodies))->toHaveCount(1)->and($bodies[0])->toBe('{"fulfilled":false,"status":"PENDING"}');
});

it('send link: validates the body', function () {
    $this->withHeaders(['Origin' => 'https://app.example.com'])->call('POST', '/api/checkout/magic-link', [], [], [], ['CONTENT_TYPE' => 'application/json'], '{nope')
        ->assertStatus(400)->assertJsonPath('error.code', 'INVALID_JSON');
    sendLink('')->assertStatus(400)->assertJsonPath('error.code', 'MISSING_SESSION_ID');
    sendLink(['x'])->assertStatus(400)->assertJsonPath('error.code', 'MISSING_SESSION_ID');
});

it('send link: 409 unless fulfilled, and 409 without a purchaser email', function () {
    orderFor('cs_pend', 'NEEDS_CONTACT');
    orderFor('cs_noemail', 'FULFILLED', null);
    sendLink('cs_unknown')->assertStatus(409)->assertJsonPath('error.code', 'NOT_FULFILLED');
    sendLink('cs_pend')->assertStatus(409)->assertJsonPath('error.code', 'NOT_FULFILLED');
    sendLink('cs_noemail')->assertStatus(409)->assertJsonPath('error.code', 'MISSING_EMAIL');
});

it('send link: emails a sign-in link to the recorded address, never returns it, never a setup link; both routes work', function () {
    Queue::fake();
    orderFor('cs_ok');
    User::factory()->create(['email' => 'buyer@example.test', 'password' => null]); // no password: `setup` would be possible
    foreach (['/api/checkout/magic-link', '/api/checkout/resend-magic-link'] as $path) {
        $r = $this->withHeaders(['Origin' => 'https://app.example.com'])->postJson($path, ['session_id' => 'cs_ok'])->assertOk()->assertExactJson(['ok' => true, 'delivery' => 'email']);
        expect($r->getContent())->not->toContain('token')->not->toContain('http');
    }
    Queue::assertPushed(SendAuthLinkMail::class, 2);
    Queue::assertPushed(SendAuthLinkMail::class, fn ($j) => $j->kind === 'magic' && $j->next === '/dashboard');
    expect(DB::table('auth_proofs')->count())->toBe(0); // the request writes no proof
});

it('send link: the request answers the same and sends nothing whether or not the purchaser has an account (Q2, DV-27)', function () {
    Queue::fake();
    Mail::fake();
    orderFor('cs_known');
    orderFor('cs_unknown_acct', 'FULFILLED', 'nobody@example.test');
    User::factory()->create(['email' => 'buyer@example.test']);
    $known = sendLink('cs_known');
    $unknown = sendLink('cs_unknown_acct');
    expect($unknown->getStatusCode())->toBe($known->getStatusCode())->toBe(200)
        ->and($unknown->getContent())->toBe($known->getContent());
    Queue::assertPushed(SendAuthLinkMail::class, 2); // one job each; the unknown one carries no user id
    Queue::assertPushed(SendAuthLinkMail::class, fn ($j) => $j->userId === null);
    Mail::assertNothingSent();
    expect(DB::table('auth_proofs')->count())->toBe(0);
    // The job does the work: known sends a proof and a mail, unknown nothing.
    Queue::pushed(SendAuthLinkMail::class)->each(fn ($j) => $j->handle(app(SendAuthLink::class)));
    expect(DB::table('auth_proofs')->where('kind', 'magic')->count())->toBe(1);
});

it('send link: 429 after 3 per session, with Retry-After and the fixed message', function () {
    orderFor('cs_ok');
    User::factory()->create(['email' => 'buyer@example.test']);
    for ($i = 0; $i < 3; $i++) {
        sendLink('cs_ok')->assertOk();
    }
    $r = sendLink('cs_ok')->assertStatus(429)->assertJsonPath('error.code', 'RATE_LIMITED')
        ->assertJsonPath('error.message', 'Please wait before requesting another sign-in email.');
    expect((int) $r->headers->get('Retry-After'))->toBeGreaterThan(0);
});

it('send link: 503 when mail is unconfigured; a failed send happens in the job and leaks nothing to the request', function () {
    Queue::fake();
    orderFor('cs_ok');
    User::factory()->create(['email' => 'buyer@example.test']);
    config(['mail.from.address' => '']);
    sendLink('cs_ok')->assertStatus(503)->assertJsonPath('error.code', 'EMAIL_UNAVAILABLE');
    Queue::assertNothingPushed();

    config(['mail.from.address' => 'from@example.test']);
    Mail::shouldReceive('mailer->send')->andThrow(new RuntimeException('postmark said https://x/#token=SECRET'));
    $r = sendLink('cs_ok')->assertOk();
    expect($r->getContent())->not->toContain('SECRET')->not->toContain('postmark');
});

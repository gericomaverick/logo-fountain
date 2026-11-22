<?php

use App\Support\Audit;
use App\Support\Scrubber;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Support\PortalRows;
use Tests\Support\RefreshDatabaseAsOwner;

// Story 2.4 AC 7-8 (X-08): Audit::record() writes one scrubbed audit_events row inside the open transaction.
// "Identical JSON" is checked in PostgreSQL (stored jsonb = given jsonb), as Next's Prisma row was jsonb too.

uses(RefreshDatabaseAsOwner::class);

const REDACTED_AUDIT = Scrubber::REDACTED;

/** @return array{0: string, 1: string} project id, actor (profile) id */
function auditRefs(): array
{
    $rows = new PortalRows('pgsql');

    return [$rows->project($rows->client()), $rows->profile()];
}

function storedPayload(string $id): string
{
    return (string) DB::table('audit_events')->where('id', $id)->value('payload');
}

function storedEquals(string $id, string $json): bool
{
    return (bool) DB::scalar('SELECT payload = ?::jsonb FROM audit_events WHERE id = ?', [$json, $id]);
}

it('inserts one row with the type, references and payload', function () {
    [$projectId, $actorId] = auditRefs();

    $id = Audit::record('message_sent', $projectId, $actorId, ['messageId' => 'm-1', 'isAdmin' => true]);

    $row = DB::table('audit_events')->sole();
    expect($row->id)->toBe($id)->and(Str::isUuid($id))->toBeTrue()
        ->and($row->project_id)->toBe($projectId)->and($row->actor_id)->toBe($actorId)
        ->and($row->type)->toBe('message_sent')->and($row->created_at)->not->toBeNull()
        ->and(storedEquals($id, '{"messageId":"m-1","isAdmin":true}'))->toBeTrue();
});

it('accepts models as references and allows a null project and actor', function () {
    [$projectId, $actorId] = auditRefs();
    $model = fn (string $id) => tap(new class extends Model
    {
        protected $keyType = 'string';
    })->setAttribute('id', $id);

    $withModels = Audit::record('state_changed', $model($projectId), $model($actorId), ['nextStatus' => 'ON_HOLD']);
    $system = Audit::record('auth.password_reset', null, null, ['method' => 'token']);

    expect(DB::table('audit_events')->where('id', $withModels)->first(['project_id', 'actor_id']))->toEqual((object) ['project_id' => $projectId, 'actor_id' => $actorId])
        ->and(DB::table('audit_events')->where('id', $system)->first(['project_id', 'actor_id']))->toEqual((object) ['project_id' => null, 'actor_id' => null]);
});

it('stores a missing or empty payload as an object, never a list', function (?array $payload) {
    $id = Audit::record('email_sent:concepts_ready', null, null, $payload);

    expect(storedPayload($id))->toBe('{}')
        ->and(DB::scalar('SELECT jsonb_typeof(payload) FROM audit_events WHERE id = ?', [$id]))->toBe('object');
})->with(['missing' => [null], 'empty array' => [[]]]);

it('refuses a payload that is a JSON list', function () {
    expect(fn () => Audit::record('state_changed', null, null, ['a', 'b']))->toThrow(InvalidArgumentException::class, 'JSON object');
    expect(DB::table('audit_events')->count())->toBe(0);
});

// Every payload shape Next writes today (story 2.4 Next.js source read), stored with identical JSON.
dataset('next payloads', [
    'order_fulfilled (new project)' => ['order_fulfilled', '{"orderId":"5b1e6c2a-1f7a-4b51-9a3e-0c2f4d9e8a11","orderStatus":"FULFILLED","checkoutSessionId":"cs_test_a1B2c3D4e5F6g7H8i9J0kLmNoPqRsTuVwXyZ","kind":"new_project"}'],
    'order_fulfilled (add-on)' => ['order_fulfilled', '{"orderId":"o-2","orderStatus":"FULFILLED","checkoutSessionId":"cs_live_b1C2d3E4f5G6h7I8j9K0lMnOpQrStUvWxYz"}'],
    'webhook customer email marker' => ['email_sent:order_confirmation', '{"checkoutSessionId":"cs_test_c1D2e3F4g5H6i7J8k9L0mNoPqRsTuVwXyZa"}'],
    'entitlement_addon_applied' => ['entitlement_addon_applied', '{"checkoutSessionId":"cs_test_d1","paymentIntentId":"pi_3Nabc123","addonKey":"extra_revision","revisionDelta":1}'],
    'package_upgrade_applied' => ['package_upgrade_applied', '{"checkoutSessionId":"cs_test_e1","paymentIntentId":"pi_3Ndef456","fromPackage":"essential","toPackage":"premium"}'],
    'state_changed with heldVersion' => ['state_changed', '{"previousStatus":"CONCEPTS_READY","nextStatus":"ON_HOLD","reason":"Client asked to pause","source":"constrained_admin_exception","heldVersion":"2026-11-20T08:41:00.123Z"}'],
    'state_changed from null' => ['state_changed', '{"previousStatus":null,"nextStatus":"AWAITING_BRIEF"}'],
    'entitlement_consumed' => ['entitlement_consumed', '{"key":"concepts","after":{"limitInt":3,"consumedInt":1},"reason":"admin_concept_publish","conceptId":"c-1","conceptNumber":1}'],
    'entitlement_limit_overridden' => ['entitlement_limit_overridden', '{"before":{"concepts":3,"revisions":2},"after":{"concepts":4,"revisions":2},"changed":{"concepts":true,"revisions":false},"reason":"goodwill"}'],
    'concept_upload_request with notes' => ['concept_upload_request', '{"requestKey":"9f1c","digest":"'.str_repeat('a', 64).'","result":{"concept":{"id":"c-1","number":2,"status":"published","notes":"Bolder mark; questions to jo.bloggs@example.com"},"projectStatus":"CONCEPTS_READY"},"object":{"bucket":"portal-concepts","path":"projects/p-1/concepts/2/v1.png"}}'],
    'concept_uploaded' => ['concept_uploaded', '{"conceptId":"c-1","conceptNumber":2,"filePath":"projects/p-1/concepts/2/v1.png","published":true,"uploadMode":"new","deliveredRevisionRequests":0}'],
    'concept_deleted' => ['concept_deleted', '{"conceptId":"c-1","conceptNumber":2,"previousStatus":"published","deletedRevisionRequests":1,"deletedRevisionRequestIds":["r-1"]}'],
    'finals_uploaded' => ['finals_uploaded', '{"fileAssetId":"f-1","path":"projects/p-1/finals/logo-pack.zip","supersededFileAssetId":null}'],
    'project_reset' => ['project_reset', '{"mode":"clean-slate","clearMessages":false,"previousStatus":"CONCEPTS_READY","nextStatus":"AWAITING_BRIEF","deleted":{"concepts":2,"conceptAssets":2,"finalPublications":0,"revisionRequests":1,"conceptComments":3,"messages":0}}'],
    'brief_submitted' => ['brief_submitted', '{"briefId":"b-1","version":1,"isResubmission":false}'],
    'message_sent' => ['message_sent', '{"messageId":"m-1","isAdmin":false}'],
    'auth.password_reset' => ['auth.password_reset', '{"method":"token"}'],
    'auth.password_changed' => ['auth.password_changed', '{"method":"settings"}'],
    'revision_requested' => ['revision_requested', '{"revisionRequestId":"rr-1","conceptId":"c-1"}'],
    'revision_delivered' => ['revision_delivered', '{"revisionRequestId":"rr-1","consumedEntitlement":true}'],
    'concept_approved' => ['concept_approved', '{"conceptId":"c-1","conceptNumber":2}'],
    'concept_published' => ['concept_published', '{"conceptId":"c-1"}'],
    'concept_revision_uploaded' => ['concept_revision_uploaded', '{"conceptId":"c-1","conceptNumber":2,"filePath":"projects/p-1/concepts/2/v2.png","published":true,"uploadMode":"revision","deliveredRevisionRequests":1}'],
    'empty object marker' => ['email_sent:brief_reminder', '{}'],
]);

it('stores every payload shape Next writes with identical JSON', function (string $type, string $json) {
    $id = Audit::record($type, null, null, json_decode($json, true));

    expect(storedEquals($id, $json))->toBeTrue(storedPayload($id));
})->with('next payloads');

it('redacts tokens, credentials, secret keys and signed URLs', function () {
    $signed = 'https://abc.r2.cloudflarestorage.com/portal-finals/p/pack.zip?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=5d672d79c15b13162d9279b0855cfba6789a8edb4c82c400e06b5924a6f2b5d7';
    $id = Audit::record('state_changed', null, null, [
        'resetToken' => 'tok_9f8e7d6c5b4a',
        'nested' => ['password' => 'hunter2', 'api_key' => 'k-123', 'items' => [['clientSecret' => 'pi_123_secret_abc']]],
        'download' => $signed,
        'header' => 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl',
        'note' => 'used sk_live_51Habcdefghijklmnop and whsec_abcdefghijklmnop',
        'emptyToken' => '',
        'keep' => 'ordinary text',
    ]);

    $stored = json_decode(storedPayload($id), true);
    expect($stored['resetToken'])->toBe(REDACTED_AUDIT)
        ->and($stored['nested']['password'])->toBe(REDACTED_AUDIT)
        ->and($stored['nested']['api_key'])->toBe(REDACTED_AUDIT)
        ->and($stored['nested']['items'][0]['clientSecret'])->toBe(REDACTED_AUDIT)
        ->and($stored['download'])->toStartWith('https://abc.r2.cloudflarestorage.com/portal-finals/p/pack.zip?')->not->toContain('X-Amz-Signature=5d67')
        ->and($stored['emptyToken'])->toBe('')
        ->and($stored['keep'])->toBe('ordinary text');
    foreach (['tok_9f8e7d6c5b4a', 'hunter2', 'k-123', 'pi_123_secret_abc', 'eyJhbGciOiJIUzI1NiJ9', 'sk_live_51H', 'whsec_abc'] as $secret) {
        expect(storedPayload($id))->not->toContain($secret);
    }
});

it('keeps a top-level checkoutSessionId verbatim and redacts the same id anywhere else and in logs', function () {
    $session = 'cs_test_a1B2c3D4e5F6g7H8i9J0kLmNoPqRsTuVwXyZ';
    $payload = ['checkoutSessionId' => $session, 'sessionId' => $session, 'note' => "paid via {$session}", 'nested' => ['checkoutSessionId' => $session]];

    $stored = json_decode(storedPayload(Audit::record('order_fulfilled', null, null, $payload)), true);

    expect($stored['checkoutSessionId'])->toBe($session)
        ->and($stored['sessionId'])->toBe(REDACTED_AUDIT)
        ->and($stored['note'])->not->toContain($session)
        ->and($stored['nested']['checkoutSessionId'])->toBe(REDACTED_AUDIT)
        ->and(Scrubber::scrub(['checkoutSessionId' => $session]))->toBe(['checkoutSessionId' => REDACTED_AUDIT])
        ->and(Scrubber::scrubString("session {$session}"))->not->toContain($session);
});

it('does not mask emails in audit payloads, while logs still do', function () {
    $stored = json_decode(storedPayload(Audit::record('message_sent', null, null, ['note' => 'mail jo.bloggs@example.com'])), true);

    expect($stored['note'])->toBe('mail jo.bloggs@example.com')
        ->and(Scrubber::scrubString('mail jo.bloggs@example.com'))->toBe('mail j***@example.com');
});

// Port of ledger #96 test 5 (Next postgres.integration.test.ts:71), the audit/receipt half.
it('leaves no row when the surrounding transaction rolls back', function () {
    [$projectId, $actorId] = auditRefs();

    expect(fn () => DB::transaction(function () use ($projectId, $actorId) {
        Audit::record('concept_upload_request', $projectId, $actorId, ['requestKey' => 'rk-1', 'digest' => 'rollback', 'result' => ['ok' => true]]);
        throw new RuntimeException('abort before commit');
    }))->toThrow(RuntimeException::class, 'abort before commit');

    expect(DB::table('audit_events')->whereRaw("payload->>'requestKey' = ?", ['rk-1'])->count())->toBe(0);
});

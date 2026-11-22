<?php

use App\Jobs\SendLifecycleMail;
use App\Support\LifecycleMail;
use App\Support\LifecycleMailResult;
use App\Support\LifecycleMessage;
use Illuminate\Support\Facades\Queue;
use Tests\Support\MailFixtures;

// Story 2.7 AC 1-4, 11 (X-18; ledger #100 dedupe/skip cases). `Queue::fake()` is fine here: commit timing is
// LifecycleMailAfterCommitTest's job. Fixtures are committed rows (truncation harness).

beforeEach(function () {
    config(['portal.admin_notification_emails' => 'Ops@Example.test, ,second@example.test', 'mail.default' => 'array',
        'mail.from.address' => 'from@example.test', 'portal.public_site_url' => 'https://portal.example.test']);
    Queue::fake();
});

function clientMsg(): LifecycleMessage
{
    return LifecycleMessage::client('Subject', 'Intro.', 'Open', '/projects/x');
}
function adminMsg(): LifecycleMessage
{
    return LifecycleMessage::admin('Admin subject', 'Intro.', 'Open', '/admin/x');
}

it('builds the marker type for every N-04…N-12 form', function (string $type, ?string $key, string $expected) {
    expect(LifecycleMail::markerType($type, $key))->toBe($expected);
})->with([
    ['client_concepts_ready', 'abc', 'email_sent:client_concepts_ready:abc'],
    ['admin_new_project', null, 'email_sent:admin_new_project'],
    ['client_final_deliverables_ready', null, 'email_sent:client_final_deliverables_ready'],
    ['client_final_deliverables_ready', 'asset-1', 'email_sent:client_final_deliverables_ready:asset-1'],
    ['admin_revision_requested', '', 'email_sent:admin_revision_requested'],
]);

it('queues once, writes the marker with a null actor and an empty payload, then reports already_sent', function () {
    $p = MailFixtures::project(billing: 'bill@example.test');
    $first = LifecycleMail::sendOnce('client_x', $p['project'], 'k1', clientMsg());
    expect($first->status)->toBe('sent');
    Queue::assertPushed(SendLifecycleMail::class, 1);

    $row = DB::connection('pgsql_migrate')->table('audit_events')->where('project_id', $p['project'])->first();
    expect($row->type)->toBe('email_sent:client_x:k1')->and($row->actor_id)->toBeNull()->and($row->payload)->toBe('{}');

    expect(LifecycleMail::sendOnce('client_x', $p['project'], 'k1', clientMsg())->status)->toBe(LifecycleMailResult::ALREADY_SENT);
    Queue::assertPushed(SendLifecycleMail::class, 1);
    expect(LifecycleMail::sendOnce('client_x', $p['project'], 'k2', clientMsg())->status)->toBe('sent');
});

it('resolves the client recipient: billing, else owner, else first member; none is missing_recipient', function (?string $billing, array $members, ?string $expected) {
    $p = MailFixtures::project($billing, $members);
    $r = LifecycleMail::sendOnce('t', $p['project'], null, clientMsg());
    if ($expected === null) {
        expect($r->status)->toBe('skipped')->and($r->reason)->toBe('missing_recipient');
        Queue::assertNothingPushed();
        expect(MailFixtures::markers($p['project']))->toBe(0);

        return;
    }
    expect($r->status)->toBe('sent');
    Queue::assertPushed(SendLifecycleMail::class, fn ($j) => $j->recipients === [$expected]);
})->with([
    'billing wins' => ['bill@example.test', [['role' => 'owner', 'email' => 'o@example.test']], 'bill@example.test'],
    'blank billing, owner' => ['  ', [['role' => 'member', 'email' => 'm@example.test'], ['role' => 'Owner', 'email' => 'o@example.test']], 'o@example.test'],
    'no owner, first member' => [null, [['role' => 'member', 'email' => 'm1@example.test'], ['role' => 'member', 'email' => 'm2@example.test']], 'm1@example.test'],
    'nobody' => [null, [], null],
]);

it('resolves admin recipients from ADMIN_NOTIFICATION_EMAILS: trimmed, lowercased, empties dropped', function () {
    $p = MailFixtures::project();
    expect(LifecycleMail::sendOnce('admin_x', $p['project'], null, adminMsg())->status)->toBe('sent');
    Queue::assertPushed(SendLifecycleMail::class, fn ($j) => $j->recipients === ['ops@example.test', 'second@example.test'] && $j->admin);
    config(['portal.admin_notification_emails' => ' , ']);
    $q = MailFixtures::project();
    expect(LifecycleMail::sendOnce('admin_x', $q['project'], null, adminMsg())->reason)->toBe('missing_recipient');
});

it('checks marker, then recipient, then configuration; skips write no marker and dispatch nothing', function () {
    $p = MailFixtures::project();
    config(['mail.from.address' => '']);
    // neither a recipient nor configuration: missing_recipient (Next's order)
    expect(LifecycleMail::sendOnce('t', $p['project'], null, clientMsg())->reason)->toBe('missing_recipient');
    $q = MailFixtures::project('bill@example.test');
    expect(LifecycleMail::sendOnce('t', $q['project'], null, clientMsg())->reason)->toBe('not_configured');
    // the lifecycle mailer is Postmark and the token is empty
    config(['mail.from.address' => 'from@example.test', 'mail.default' => 'postmark', 'services.postmark.token' => '']);
    expect(LifecycleMail::sendOnce('t', $q['project'], null, clientMsg())->reason)->toBe('not_configured');
    expect(MailFixtures::markers($q['project']))->toBe(0);
    Queue::assertNothingPushed();
    // an existing marker beats everything (already_sent even when unconfigured)
    config(['mail.default' => 'array']);
    LifecycleMail::sendOnce('t', $q['project'], null, clientMsg());
    config(['mail.from.address' => '']);
    expect(LifecycleMail::sendOnce('t', $q['project'], null, clientMsg())->status)->toBe('already_sent');
});

it('rejects a non-https CTA origin before any marker is written', function () {
    config(['portal.public_site_url' => 'http://example.com']);
    $p = MailFixtures::project('bill@example.test');
    expect(fn () => LifecycleMail::sendOnce('t', $p['project'], null, clientMsg()))->toThrow(InvalidArgumentException::class);
    expect(MailFixtures::markers($p['project']))->toBe(0);
});

it('resolves the admin client name and brand', function (array $members, ?array $brief, string $client, string $name, string $brand) {
    $p = MailFixtures::project(null, $members, $client, $brief);
    LifecycleMail::sendOnce('admin_x', $p['project'], null, adminMsg());
    Queue::assertPushed(SendLifecycleMail::class, fn ($j) => $j->clientName === $name && $j->brandName === $brand);
})->with([
    'first+last' => [[['role' => 'owner', 'email' => 'o@e.test', 'first' => ' Ada ', 'last' => 'Lovelace', 'full' => 'X']], ['brandName' => ' Brand '], 'Acme', 'Ada Lovelace', 'Brand'],
    'full name' => [[['role' => 'owner', 'email' => 'o@e.test', 'full' => 'Ada L']], null, 'Acme ', 'Ada L', 'Acme'],
    'defaults' => [[], ['brandName' => '  '], 'Acme', 'Client', 'Acme'],
    'no members, no brief, blank client name stays blank' => [[], null, '  ', 'Client', ''],
]);

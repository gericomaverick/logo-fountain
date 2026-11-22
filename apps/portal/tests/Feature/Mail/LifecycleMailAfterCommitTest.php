<?php

use App\Jobs\SendLifecycleMail;
use App\Support\Db;
use App\Support\LifecycleMail;
use App\Support\LifecycleMessage;
use Illuminate\Contracts\Queue\ShouldQueueAfterCommit;
use Illuminate\Database\Connection;
use Illuminate\Support\Facades\DB as Database;
use Tests\Support\MailFixtures;

// Story 2.7 AC 5 (DV-8, ADR-019): the real `database` queue connection and `jobs` table, never Queue::fake().

beforeEach(function () {
    config(['queue.default' => 'database', 'mail.default' => 'array', 'mail.from.address' => 'from@example.test',
        'portal.public_site_url' => 'https://portal.example.test']);
});

afterEach(fn () => Database::disconnect());

function acMsg(): LifecycleMessage
{
    return LifecycleMessage::client('S', 'I', 'Go', '/p');
}

it('sets after_commit on the database connection', function () {
    expect(config('queue.connections.database.after_commit'))->toBeTrue();
    expect(is_subclass_of(SendLifecycleMail::class, ShouldQueueAfterCommit::class))->toBeTrue();
});

it('queues no job before commit and one after', function () {
    $p = MailFixtures::project('b@example.test');
    Database::beginTransaction();
    expect(LifecycleMail::sendOnce('t', $p['project'], null, acMsg())->status)->toBe('sent');
    expect(MailFixtures::jobs())->toBe(0);
    Database::commit();
    expect(MailFixtures::jobs())->toBe(1)->and(MailFixtures::markers($p['project']))->toBe(1);
});

it('leaves no job and no marker when the transaction rolls back', function () {
    $p = MailFixtures::project('b@example.test');
    Database::beginTransaction();
    LifecycleMail::sendOnce('t', $p['project'], null, acMsg());
    Database::rollBack();
    expect(MailFixtures::jobs())->toBe(0)->and(MailFixtures::markers($p['project']))->toBe(0);
});

it('queues once across a serialization retry', function () {
    $p = MailFixtures::project('b@example.test');
    $attempts = 0;
    Db::serializable(function (Connection $db) use ($p, &$attempts) {
        LifecycleMail::sendOnce('t', $p['project'], null, acMsg());
        if (++$attempts === 1) {
            $db->statement("DO \$\$ BEGIN RAISE EXCEPTION 'conflict' USING ERRCODE = '40001'; END \$\$");
        }
    }, fn () => new RuntimeException('conflict'));
    expect($attempts)->toBe(2)->and(MailFixtures::jobs())->toBe(1)->and(MailFixtures::markers($p['project']))->toBe(1);
});

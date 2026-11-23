<?php

namespace App\Console\Commands;

use App\Support\Audit;
use App\Support\DatabaseRoles;
use Illuminate\Console\Command;
use Illuminate\Database\Connection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * A-12 (story 4.9a): the one-time admin bootstrap, Next `scripts/bootstrap-admin.mjs`. MANUAL ONLY: no deploy hook,
 * scheduler, seeder or route runs it (arch test). It runs on `pgsql_migrate` as the table owner, the only role the
 * `protect_operator_admin_flag` trigger lets set `is_admin` and the only one that can read `auth_admin_bootstrap`.
 * `--prepare` makes an unprivileged, unverified identity; the mailbox is verified through the recovery email; the
 * grant needs the exact UUID and the acknowledgement. Marker row and grant commit together, under one lock.
 */
final class BootstrapAdmin extends Command
{
    private const ACK = 'ONE_TIME_ADMIN_BOOTSTRAP';

    protected $signature = 'portal:bootstrap-admin
        {--prepare : Create an unprivileged identity and print its UUID}
        {--email= : The operator\'s mailbox}
        {--confirm-user= : The UUID printed by --prepare}
        {--ack= : '.self::ACK.'}
        {--database='.DatabaseRoles::MIGRATE.' : Must be the migrate connection}';

    protected $description = 'One-time admin bootstrap (operator only): --prepare, then verify the mailbox, then grant';

    public function handle(): int
    {
        if ($this->option('database') !== DatabaseRoles::MIGRATE) {
            return $this->refuse('portal:bootstrap-admin runs only on the '.DatabaseRoles::MIGRATE.' connection (ADR-013).');
        }

        $prepare = (bool) $this->option('prepare');
        $email = strtolower(trim((string) $this->option('email')));
        $confirm = strtolower((string) $this->option('confirm-user'));
        if (! str_contains($email, '@') || (! $prepare && ($this->option('ack') !== self::ACK || ! Str::isUuid($confirm)))) {
            return $this->refuse('Use --prepare --email=EMAIL, or --email=EMAIL --confirm-user=UUID --ack='.self::ACK);
        }

        try {
            DB::connection(DatabaseRoles::MIGRATE)->transaction(function (Connection $db) use ($prepare, $email, $confirm): void {
                // Not in Support\Locks (architecture §5 lists three, runtime-connection locks): this one is the operator's, on pgsql_migrate.
                $db->select("SELECT pg_advisory_xact_lock(hashtextextended('operator-admin-bootstrap', 0))");
                $prepare ? $this->prepare($db, $email) : $this->grant($db, $email, $confirm);
            });
        } catch (BootstrapRefused $e) {
            return $this->refuse($e->getMessage());
        }

        return self::SUCCESS;
    }

    private function prepare(Connection $db, string $email): void
    {
        $this->guards($db);

        $db->table('users')->insertOrIgnore(['id' => (string) Str::uuid(), 'name' => $email, 'email' => $email, 'created_at' => now(), 'updated_at' => now()]);
        $found = $db->table('users')->where('email', $email)->value('id');
        $id = is_string($found) ? $found : '';
        $db->table('profiles')->insertOrIgnore(['id' => $id, 'email' => $email, 'created_at' => now(), 'updated_at' => now()]);

        $this->info("Unprivileged identity: {$id}. Verify the mailbox through the app's recovery email before the separate grant command.");
    }

    private function grant(Connection $db, string $email, string $confirm): void
    {
        $this->guards($db);

        $user = $db->table('users')->where('id', $confirm)->where('email', $email)->whereNotNull('email_verified_at')->lockForUpdate()->first();
        if ($user === null) {
            throw new BootstrapRefused('Refused: an existing user with this exact email and UUID and a verified mailbox is required.');
        }
        if ($db->table('profiles')->where('is_admin', true)->exists()) {
            throw new BootstrapRefused('Refused: an admin already exists.');
        }
        if ($db->table('profiles')->where('id', $user->id)->update(['is_admin' => true, 'updated_at' => now()]) !== 1) {
            throw new BootstrapRefused('Refused: the matching profile row is missing.');
        }

        $db->table('auth_admin_bootstrap')->insert(['id' => 1, 'user_id' => $user->id]);
        $db->table('audit_events')->insert([
            'id' => (string) Str::uuid(),
            'actor_id' => $user->id,
            'type' => 'admin.bootstrapped',
            'payload' => Audit::encodePayload(['userId' => $user->id]),
        ]);

        $this->info('One-time verified operator bootstrap committed.');
    }

    /** The owner check and the single-use marker, in Next's order. */
    private function guards(Connection $db): void
    {
        $owner = $db->selectOne("SELECT current_user = pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid = 'public.profiles'::regclass");
        if (! ($owner instanceof \stdClass) || ($owner->owner ?? false) !== true) {
            throw new BootstrapRefused('Refused: the connection role must own the schema (the migration role).');
        }
        if ($db->table('auth_admin_bootstrap')->exists()) {
            throw new BootstrapRefused('Refused: the one-time bootstrap is already consumed.');
        }
    }

    private function refuse(string $message): int
    {
        $this->error($message);

        return self::FAILURE;
    }
}

/** An expected refusal: nothing is written, the transaction rolls back. */
final class BootstrapRefused extends RuntimeException {}

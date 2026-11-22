<?php

namespace Database\Seeders\Parity;

use App\Support\DatabaseRoles;
use Carbon\CarbonImmutable;
use Illuminate\Database\Connection;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Story 2.6 (O-02): the Laravel half of the parity seed, a port of apps/web/scripts/parity-seed.mjs. Resets the
 * parity database and loads one scenario: the guard first, then the whole file validated, then truncate and every
 * insert in one transaction on the migrate (owner) connection, as raw inserts (the admin-flag trigger lets only the
 * owner set `is_admin`, and no model ever writes it). Ids are ScenarioId's, with Next's kind/key strings; timestamps
 * are Next's: users now, each project at now − createdDaysAgo days and its events one minute apart after that.
 * Rows only: the objects behind file_assets come with object storage (story 3.1).
 */
final class ParitySeeder
{
    /**
     * Next's APP_TABLES (parity-seed.mjs:51-53), mapped to the 2.1 schema (AuthUser + AuthAccount → users,
     * AuthSession → sessions; AuthVerification has no table), plus the queue tables so a job queued under the
     * previous scenario can't run against this one. Kept: migrations, cache, cache_locks, job_batches, the parity schema.
     */
    public const TABLES = ['auth_rate_limits', 'auth_admin_bootstrap', 'auth_proofs', 'sessions', 'project_read_states',
        'audit_events', 'concept_comments', 'revision_requests', 'messages', 'message_threads', 'file_assets', 'concepts',
        'project_entitlements', 'project_orders', 'project_brief_drafts', 'project_briefs', 'projects', 'client_memberships',
        'clients', 'profiles', 'users', 'stripe_events', 'jobs', 'failed_jobs'];

    /** parity-seed.mjs:23: the smallest valid PNG; its size goes into the concept asset rows. */
    private const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    /** parity-seed.mjs:146: storedZip("logo.svg", <svg …/>), a one-file stored ZIP: 30 + 46 + 22 header bytes, the name twice. */
    private const ZIP_NAME = 'logo.svg';

    private const ZIP_CONTENT = "<svg xmlns='http://www.w3.org/2000/svg'/>";

    public function __construct(private readonly ParityGuard $guard) {}

    public function seed(string $name): Scenario
    {
        if (! Scenario::validName($name)) {
            throw new ParitySeedError("Usage: php artisan parity:seed <scenario> (\"{$name}\" is not a scenario name: a-z, 0-9 and -)");
        }
        $this->guard->assertTarget();
        $scenario = Scenario::load(Config::string('parity.scenarios_dir'), $name);
        $this->guard->assertMarker();

        $db = DB::connection(DatabaseRoles::MIGRATE);
        $db->transaction(function () use ($db, $scenario): void {
            $db->statement('TRUNCATE '.implode(', ', self::TABLES).' CASCADE');
            $this->insert($db, $scenario);
        });

        return $scenario;
    }

    public static function conceptAssetSize(): int
    {
        return strlen((string) base64_decode(self::PNG, true));
    }

    public static function finalZipSize(): int
    {
        return 30 + 46 + 22 + 2 * strlen(self::ZIP_NAME) + strlen(self::ZIP_CONTENT);
    }

    private function insert(Connection $db, Scenario $scenario): void
    {
        $id = static fn (string $kind, string $key): string => ScenarioId::for($scenario->name, $kind, $key);
        $now = CarbonImmutable::now('UTC');
        $ts = static fn (CarbonImmutable $at): string => $at->format('Y-m-d H:i:s.v');

        $users = [];
        foreach ($scenario->users as $u) {
            $userId = $users[$u->key] = $id('user', $u->key);
            $fullName = "{$u->firstName} {$u->lastName}";
            $db->table('users')->insert([
                'id' => $userId, 'name' => $fullName, 'email' => $u->email,
                'email_verified_at' => $u->emailVerified ? $ts($now) : null,
                'password' => $u->password === null ? null : Hash::make($u->password),
                'created_at' => $ts($now), 'updated_at' => $ts($now),
            ]);
            $db->table('profiles')->insert([
                'id' => $userId, 'email' => $u->email, 'full_name' => $fullName, 'first_name' => $u->firstName,
                'last_name' => $u->lastName, 'is_admin' => $u->admin, 'created_at' => $ts($now), 'updated_at' => $ts($now),
            ]);
            if ($u->admin) {
                $db->table('auth_admin_bootstrap')->insertOrIgnore(['id' => 1, 'user_id' => $userId]);
            }
        }
        $admin = $scenario->firstAdmin();
        $adminId = $admin === null ? null : $users[$admin->key];

        foreach ($scenario->projects as $p) {
            $projectId = $id('project', $p->key);
            $clientId = $id('client', $p->key);
            $created = $now->subMilliseconds($p->createdDaysAgo * 86_400_000);
            $tick = 0;
            $at = static function () use (&$tick, $created): CarbonImmutable {
                $tick++;

                return $created->addMinutes($tick);
            };
            $owner = $users[$p->members[0]];

            $slug = preg_replace('/[^a-z0-9]+/', '-', strtolower($p->clientName)).'-'.$p->key;
            $db->table('clients')->insert([
                'id' => $clientId, 'name' => $p->clientName, 'slug' => $slug, 'billing_email' => $p->billingEmail,
                'created_at' => $ts($created), 'updated_at' => $ts($created),
            ]);
            foreach ($p->members as $member) {
                $db->table('client_memberships')->insert([
                    'id' => $id('membership', "{$p->key}:{$member}"), 'client_id' => $clientId, 'user_id' => $users[$member],
                    'role' => 'owner', 'created_at' => $ts($created),
                ]);
            }
            $db->table('projects')->insert([
                'id' => $projectId, 'client_id' => $clientId, 'status' => $p->status, 'package_code' => $p->package,
                'created_at' => $ts($created), 'updated_at' => $ts($created),
            ]);
            $db->table('project_orders')->insert([
                'id' => $id('order', $p->key), 'project_id' => $projectId, 'client_id' => $clientId, 'status' => $p->orderStatus,
                'currency' => 'gbp', 'total_cents' => $p->orderTotalCents, 'stripe_checkout_session_id' => $p->orderSessionId,
                'stripe_payment_intent_id' => $p->orderPaymentIntentId, 'created_at' => $ts($created), 'updated_at' => $ts($created),
            ]);
            foreach ($p->entitlements as $key => [$limit, $consumed, $reserved]) {
                $db->table('project_entitlements')->insert([
                    'id' => $id('entitlement', "{$p->key}:{$key}"), 'project_id' => $projectId, 'key' => $key,
                    'limit_int' => $limit, 'consumed_int' => $consumed, 'reserved_int' => $reserved,
                    'created_at' => $ts($created), 'updated_at' => $ts($created),
                ]);
            }

            $previous = null;
            foreach ($p->stateHistory as $state) {
                $when = $at();
                $payload = ['previousStatus' => $previous, 'nextStatus' => $state];
                if ($state === 'ON_HOLD') {
                    $payload += ['reason' => $p->holdReason ?? 'Parity hold', 'source' => 'constrained_admin_exception'];
                }
                $db->table('audit_events')->insert([
                    'id' => $id('audit', "{$p->key}:state:{$state}:{$tick}"), 'project_id' => $projectId,
                    'actor_id' => $previous === null ? null : $adminId, 'type' => 'state_changed',
                    'payload' => self::json($payload), 'created_at' => $ts($when),
                ]);
                $previous = $state;
            }
            if ($p->briefAnswers !== null) {
                $db->table('project_briefs')->insert([
                    'id' => $id('brief', $p->key), 'project_id' => $projectId, 'version' => 1,
                    'answers' => self::json($p->briefAnswers), 'created_by' => $owner, 'created_at' => $ts($at()),
                ]);
            }
            if ($p->briefDraftAnswers !== null) {
                $db->table('project_brief_drafts')->insert([
                    'project_id' => $projectId, 'answers' => self::json($p->briefDraftAnswers), 'updated_by' => $owner,
                    'updated_at' => $ts($at()),
                ]);
            }

            $conceptIds = [];
            foreach ($p->concepts as $c) {
                $conceptId = $conceptIds[$c['number']] = $id('concept', "{$p->key}:{$c['number']}");
                $when = $ts($at());
                $db->table('concepts')->insert([
                    'id' => $conceptId, 'project_id' => $projectId, 'number' => $c['number'], 'status' => $c['status'],
                    'notes' => $c['notes'], 'created_at' => $when, 'updated_at' => $when,
                ]);
                $db->table('file_assets')->insert([
                    'id' => $id('asset', "{$p->key}:concept:{$c['number']}"), 'project_id' => $projectId, 'kind' => 'concept',
                    'bucket' => 'concepts', 'path' => "{$projectId}/{$conceptId}/v1.".$id('object', "{$p->key}:{$c['number']}").'.png',
                    'mime' => 'image/png', 'size' => self::conceptAssetSize(), 'uploaded_by' => $adminId,
                    'created_at' => $when, 'updated_at' => $when,
                ]);
            }
            foreach ($p->revisionRequests as $i => $r) {
                $when = $ts($at());
                $db->table('revision_requests')->insert([
                    'id' => $id('revision', "{$p->key}:{$i}"), 'project_id' => $projectId,
                    'concept_id' => $conceptIds[$r['concept']] ?? null, 'status' => $r['status'], 'requested_by' => $owner,
                    'body' => $r['body'], 'created_at' => $when, 'updated_at' => $when,
                ]);
            }
            foreach ($p->comments as $i => $c) {
                $db->table('concept_comments')->insert([
                    'id' => $id('comment', "{$p->key}:{$i}"), 'project_id' => $projectId, 'concept_id' => $conceptIds[$c['concept']],
                    'author_id' => $users[$c['author']], 'body' => $c['body'], 'created_at' => $ts($at()),
                ]);
            }
            if ($p->messages !== []) {
                $threadId = $id('thread', $p->key);
                $db->table('message_threads')->insert([
                    'id' => $threadId, 'project_id' => $projectId, 'created_at' => $ts($created), 'updated_at' => $ts($created),
                ]);
                foreach ($p->messages as $i => $m) {
                    $db->table('messages')->insert([
                        'id' => $id('message', "{$p->key}:{$i}"), 'thread_id' => $threadId, 'project_id' => $projectId,
                        'sender_id' => $users[$m['sender']], 'kind' => $m['kind'], 'body' => $m['body'], 'created_at' => $ts($at()),
                    ]);
                }
            }
            if ($p->finalZip) {
                $when = $ts($at());
                $db->table('file_assets')->insert([
                    'id' => $id('asset', "{$p->key}:final"), 'project_id' => $projectId, 'kind' => 'final_zip',
                    'bucket' => 'final-deliverables', 'path' => "{$projectId}/finals/".$id('object', "{$p->key}:final").'.zip',
                    'mime' => 'application/zip', 'size' => self::finalZipSize(), 'uploaded_by' => $adminId,
                    'created_at' => $when, 'updated_at' => $when,
                ]);
            }
            // parity-seed.mjs:151: the version stamp is the latest seeded event.
            $db->table('projects')->where('id', $projectId)->update(['updated_at' => $ts($created->addMinutes($tick))]);
        }
    }

    /** @param array<mixed> $value */
    private static function json(array $value): string
    {
        return $value === [] ? '{}' : json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }
}

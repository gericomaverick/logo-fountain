<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;
use LogicException;

/**
 * Story 2.4 (X-09, architecture §5 Transactions): the only advisory locks. Each is
 * `pg_advisory_xact_lock(hashtextextended(<key>, 0))` on the runtime connection, with Next's key strings,
 * held until the surrounding transaction commits or rolls back. Callable only inside a transaction.
 */
final class Locks
{
    /** The credential fence (Next `lib/auth/fence.ts:8`). Story 4.2 sets the fence's own timeouts. */
    public static function credential(string $userId): void
    {
        self::acquire('auth:'.$userId);
    }

    /** Access provisioning (Next `lib/checkout-fulfillment.ts:449`). Pass the already-normalised email, as Next. */
    public static function provision(string $email): void
    {
        self::acquire('provision:'.$email);
    }

    /** Concept upload receipts (Next `api/admin/projects/[id]/concepts/route.ts:249`). */
    public static function conceptUpload(string $projectId, string $requestKey): void
    {
        self::acquire($projectId.':'.$requestKey);
    }

    private static function acquire(string $key): void
    {
        $db = DB::connection(DatabaseRoles::RUNTIME);
        if ($db->transactionLevel() === 0) {
            throw new LogicException('Locks must be taken inside a transaction on the runtime connection (they are released at commit or rollback).');
        }
        $db->select('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', [$key]);
    }
}

<?php

namespace App\Support\Auth;

use App\Exceptions\AuthFailure;
use App\Support\DatabaseRoles;
use App\Support\Db;
use App\Support\Locks;
use Closure;
use Illuminate\Database\Connection;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB as Database;

/**
 * A-10 / ADR-007 (Next `lib/auth/fence.ts`): every credential change runs in one transaction on the runtime
 * connection under the per-user advisory lock, so concurrent resets, changes and logins have one winner.
 * Waiting past the lock timeout, or running past the statement timeout, is the generic AuthFailure (never a SQLSTATE).
 */
final class CredentialFence
{
    public const LOCK_TIMEOUT = '5s';

    public const STATEMENT_TIMEOUT = '20s';

    private const LOCK_NOT_AVAILABLE = '55P03';

    private const QUERY_CANCELED = '57014';

    /**
     * @template T
     *
     * @param  Closure(Connection): T  $work  every query inside must use the connection it is given
     * @return T
     *
     * @throws AuthFailure
     */
    public static function run(string $userId, Closure $work): mixed
    {
        try {
            return Database::connection(DatabaseRoles::RUNTIME)->transaction(function (Connection $db) use ($userId, $work) {
                // SET LOCAL does not accept bind parameters; the values are constants.
                $db->statement("SET LOCAL lock_timeout = '".self::LOCK_TIMEOUT."'");
                $db->statement("SET LOCAL statement_timeout = '".self::STATEMENT_TIMEOUT."'");
                Locks::credential($userId);

                return $work($db);
            });
        } catch (QueryException $e) {
            if (in_array(Db::sqlState($e), [self::LOCK_NOT_AVAILABLE, self::QUERY_CANCELED], true)) {
                throw new AuthFailure;
            }
            throw $e;
        }
    }
}

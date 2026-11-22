<?php

namespace App\Support;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use InvalidArgumentException;
use stdClass;

/**
 * Story 2.4 (X-08, architecture §5 Audit): the only writer of `audit_events` (Next `lib/audit.ts`).
 * The row is inserted on the runtime connection, inside whatever transaction is open there, so it commits or
 * rolls back with the business change (audit rows double as idempotency receipts). The payload passes
 * through the Scrubber's audit profile; a missing or empty payload is stored as `{}`, as Next's `payload ?? {}`.
 */
final class Audit
{
    private const JSON_FLAGS = JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE;

    /**
     * A nested empty PHP array is stored as `[]`: pass `new stdClass` where Next stores `{}`.
     *
     * @param  array<string, mixed>|null  $payload
     * @return string the new row's id
     */
    public static function record(string $type, Model|string|null $project, Model|string|null $actor, ?array $payload = null): string
    {
        $id = (string) Str::uuid();
        DB::connection(DatabaseRoles::RUNTIME)->table('audit_events')->insert([
            'id' => $id,
            'project_id' => self::key($project),
            'actor_id' => self::key($actor),
            'type' => $type,
            'payload' => self::encodePayload($payload),
        ]);

        return $id;
    }

    /**
     * The JSON stored for a payload: normalised through JSON first (so objects, JsonSerializable values and dates
     * become plain data the scrubber walks), then scrubbed with the audit profile.
     *
     * @param  array<string, mixed>|null  $payload
     */
    public static function encodePayload(?array $payload): string
    {
        $data = json_decode(json_encode($payload ?? [], self::JSON_FLAGS), false, 512, JSON_THROW_ON_ERROR);
        if ($data === []) {
            $data = new stdClass;
        }
        if (! $data instanceof stdClass) {
            throw new InvalidArgumentException('An audit payload must be a JSON object.');
        }

        return json_encode(Scrubber::scrubAuditPayload($data), self::JSON_FLAGS);
    }

    private static function key(Model|string|null $value): ?string
    {
        if (! $value instanceof Model) {
            return $value;
        }
        $key = $value->getKey();

        return is_string($key) ? $key : throw new InvalidArgumentException('Audit references need a string (uuid) key.');
    }
}

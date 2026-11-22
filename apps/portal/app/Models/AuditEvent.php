<?php

namespace App\Models;

use App\Models\Concerns\HasMillisecondTimestamps;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Written only through `Audit::record` (story 2.4). `payload` is returned verbatim by the admin audit
 * endpoint (`api/admin/projects/[id]/audit/route.ts:16-19`), so it uses the `object` cast: `{}` and `[]`
 * each round-trip unchanged (an `array` cast would turn `{}` into `[]`).
 *
 * @property string $id
 * @property string|null $project_id
 * @property string|null $actor_id
 * @property string $type
 * @property \stdClass|array<array-key, mixed> $payload
 */
#[Fillable(['project_id', 'actor_id', 'type', 'payload'])]
class AuditEvent extends Model
{
    use HasMillisecondTimestamps, HasUuids;

    public const UPDATED_AT = null;

    /** @return BelongsTo<Project, $this> */
    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /** @return BelongsTo<Profile, $this> */
    public function actor(): BelongsTo
    {
        return $this->belongsTo(Profile::class, 'actor_id');
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'payload' => 'object',
        ];
    }
}

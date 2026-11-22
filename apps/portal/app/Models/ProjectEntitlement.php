<?php

namespace App\Models;

use App\Models\Concerns\HasMillisecondTimestamps;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * `limit_int` null means unlimited.
 *
 * @property string $id
 * @property string $project_id
 * @property string $key
 * @property int|null $limit_int
 * @property int $consumed_int
 * @property int $reserved_int
 */
#[Fillable(['project_id', 'key', 'limit_int', 'consumed_int', 'reserved_int'])]
class ProjectEntitlement extends Model
{
    use HasMillisecondTimestamps, HasUuids;

    /** @return BelongsTo<Project, $this> */
    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'limit_int' => 'integer',
            'consumed_int' => 'integer',
            'reserved_int' => 'integer',
        ];
    }
}

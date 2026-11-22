<?php

namespace App\Models;

use App\Models\Concerns\HasMillisecondTimestamps;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A submitted brief version (immutable: no updated_at). `answers` is a JSON object, kept as `stdClass`
 * so `{}` stays `{}` (the `object` cast; an empty PHP array would encode as `[]`).
 *
 * @property string $id
 * @property string $project_id
 * @property int $version
 * @property \stdClass|array<array-key, mixed> $answers
 * @property string $created_by
 */
#[Fillable(['project_id', 'version', 'answers', 'created_by'])]
class ProjectBrief extends Model
{
    use HasMillisecondTimestamps, HasUuids;

    public const UPDATED_AT = null;

    /** @return BelongsTo<Project, $this> */
    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /** @return BelongsTo<Profile, $this> */
    public function author(): BelongsTo
    {
        return $this->belongsTo(Profile::class, 'created_by');
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'version' => 'integer',
            'answers' => 'object',
        ];
    }
}

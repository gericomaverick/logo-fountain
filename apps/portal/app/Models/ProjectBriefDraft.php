<?php

namespace App\Models;

use App\Models\Concerns\HasMillisecondTimestamps;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * The one autosaved draft per project (keyed by project_id; only updated_at). `answers`: `object` cast,
 * as ProjectBrief.
 *
 * @property string $project_id
 * @property \stdClass|array<array-key, mixed> $answers
 * @property string $updated_by
 */
#[Fillable(['project_id', 'answers', 'updated_by'])]
class ProjectBriefDraft extends Model
{
    use HasMillisecondTimestamps;

    protected $primaryKey = 'project_id';

    public $incrementing = false;

    protected $keyType = 'string';

    public const CREATED_AT = null;

    /** @return BelongsTo<Project, $this> */
    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /** @return BelongsTo<Profile, $this> */
    public function editor(): BelongsTo
    {
        return $this->belongsTo(Profile::class, 'updated_by');
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'answers' => 'object',
        ];
    }
}

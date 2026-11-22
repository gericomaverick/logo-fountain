<?php

namespace App\Models;

use App\Models\Concerns\HasMillisecondTimestamps;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A comment on a concept (immutable: no updated_at).
 *
 * @property string $id
 * @property string $project_id
 * @property string $concept_id
 * @property string $author_id
 * @property string $body
 */
#[Fillable(['project_id', 'concept_id', 'author_id', 'body'])]
class ConceptComment extends Model
{
    use HasMillisecondTimestamps, HasUuids;

    public const UPDATED_AT = null;

    /** @return BelongsTo<Project, $this> */
    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /** @return BelongsTo<Concept, $this> */
    public function concept(): BelongsTo
    {
        return $this->belongsTo(Concept::class);
    }

    /** @return BelongsTo<Profile, $this> */
    public function author(): BelongsTo
    {
        return $this->belongsTo(Profile::class, 'author_id');
    }
}

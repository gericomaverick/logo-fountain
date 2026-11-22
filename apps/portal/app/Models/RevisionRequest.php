<?php

namespace App\Models;

use App\Models\Concerns\HasMillisecondTimestamps;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * `concept_id` is set to null if the concept row is deleted.
 *
 * @property string $id
 * @property string $project_id
 * @property string|null $concept_id
 * @property string $status
 * @property string $requested_by
 * @property string $body
 */
#[Fillable(['project_id', 'concept_id', 'status', 'requested_by', 'body'])]
class RevisionRequest extends Model
{
    use HasMillisecondTimestamps, HasUuids;

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
    public function requester(): BelongsTo
    {
        return $this->belongsTo(Profile::class, 'requested_by');
    }
}

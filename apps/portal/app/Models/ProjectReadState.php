<?php

namespace App\Models;

use App\Models\Concerns\HasMillisecondTimestamps;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * @property string $id
 * @property string $user_id
 * @property string $project_id
 * @property Carbon|null $last_seen_messages_at
 * @property Carbon|null $last_seen_concepts_at
 */
#[Fillable(['user_id', 'project_id', 'last_seen_messages_at', 'last_seen_concepts_at'])]
class ProjectReadState extends Model
{
    use HasMillisecondTimestamps, HasUuids;

    /** @return BelongsTo<Profile, $this> */
    public function profile(): BelongsTo
    {
        return $this->belongsTo(Profile::class, 'user_id');
    }

    /** @return BelongsTo<Project, $this> */
    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'last_seen_messages_at' => 'datetime',
            'last_seen_concepts_at' => 'datetime',
        ];
    }
}

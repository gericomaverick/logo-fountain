<?php

namespace App\Models;

use App\Models\Concerns\HasMillisecondTimestamps;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A project-thread message (immutable: no updated_at).
 *
 * @property string $id
 * @property string $thread_id
 * @property string $project_id
 * @property string $sender_id
 * @property string $kind
 * @property string $body
 */
#[Fillable(['thread_id', 'project_id', 'sender_id', 'kind', 'body'])]
class Message extends Model
{
    use HasMillisecondTimestamps, HasUuids;

    public const UPDATED_AT = null;

    /** @return BelongsTo<MessageThread, $this> */
    public function thread(): BelongsTo
    {
        return $this->belongsTo(MessageThread::class, 'thread_id');
    }

    /** @return BelongsTo<Project, $this> */
    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /** @return BelongsTo<Profile, $this> */
    public function sender(): BelongsTo
    {
        return $this->belongsTo(Profile::class, 'sender_id');
    }
}

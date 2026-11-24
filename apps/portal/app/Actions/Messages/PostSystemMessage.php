<?php

namespace App\Actions\Messages;

use App\Models\Message;
use App\Models\MessageThread;
use App\Models\Profile;
use Illuminate\Support\Facades\DB;

/**
 * Next's `createProjectSystemMessage` (`lib/system-messages.ts`) with DV-17: a system line is skipped only when the
 * same body was already posted since the project's last clean-slate reset (the latest `project_reset` audit event
 * with `mode: clean-slate`); before DV-17 Next deduped across the whole thread. Retries of one event stay deduped.
 * Sender is the first admin profile, else the fallback user (as Next).
 */
final class PostSystemMessage
{
    public static function post(string $projectId, string $fallbackUserId, string $body): void
    {
        DB::transaction(function () use ($projectId, $fallbackUserId, $body): void {
            $thread = MessageThread::query()->firstOrCreate(['project_id' => $projectId]);
            $existing = Message::query()->where('thread_id', $thread->id)->where('kind', 'system')->where('body', $body);
            $reset = DB::table('audit_events')->where('project_id', $projectId)->where('type', 'project_reset')
                ->whereRaw("payload->>'mode' = 'clean-slate'")->max('created_at');
            if ($reset !== null) {
                $existing->where('created_at', '>', $reset);
            }
            if ($existing->exists()) {
                return;
            }
            $sender = Profile::query()->where('is_admin', true)->orderBy('created_at')->value('id') ?? $fallbackUserId;
            $message = new Message(['thread_id' => $thread->id, 'project_id' => $projectId, 'sender_id' => $sender, 'kind' => 'system', 'body' => $body]);
            $message->save();
        });
    }
}

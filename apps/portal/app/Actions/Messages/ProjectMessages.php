<?php

namespace App\Actions\Messages;

use App\Models\ConceptComment;
use App\Models\Message;
use App\Models\MessageThread;
use App\Models\Project;
use App\Models\ProjectReadState;
use App\Models\User;
use App\Support\Audit;
use App\Support\LifecycleMail;
use App\Support\LifecycleMessage;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/** C-14 / C-15 behaviour: `api/projects/[id]/messages` and `.../read-state` (Next routes, read directly). */
final class ProjectMessages
{
    /** @return list<array<string, mixed>> */
    public static function list(Project $project): array
    {
        $out = [];
        foreach (Message::query()->with('sender')->where('project_id', $project->id)->orderBy('created_at')->orderBy('id')->get()->all() as $m) {
            $out[] = self::shape($m);
        }

        return $out;
    }

    /**
     * DV-14: $1
     *
     * @return array<string, mixed>
     */
    public static function send(Project $project, User $user, string $body): array
    {
        $message = DB::transaction(function () use ($project, $user, $body): Message {
            $thread = MessageThread::query()->firstOrCreate(['project_id' => $project->id]);
            $created = new Message(['thread_id' => $thread->id, 'project_id' => $project->id, 'sender_id' => $user->id, 'body' => $body]);
            $created->save();
            $created->refresh();
            Audit::record('message_sent', $project, $user->id, ['messageId' => $created->id, 'isAdmin' => $user->isAdmin()]);

            return $created;
        });
        $message->load('sender');

        // N-11 (client) / admin notice; one marker per message id, so it sends once.
        $path = "/project/{$project->id}/messages";
        if ($user->isAdmin()) {
            LifecycleMail::sendOnce('client_new_message', $project->id, $message->id, LifecycleMessage::client(
                'New message from your Logo Fountain designer', 'You have a new project message waiting for you.', 'Open messages', $path));
        } else {
            LifecycleMail::sendOnce('admin_message_from_project', $project->id, $message->id, LifecycleMessage::admin(
                'New client message', 'A client posted a new message in an active project.', 'Open project messages', "/admin/projects/{$project->id}/messages"));
        }

        return self::shape($message);
    }

    public static function markSeen(Project $project, User $user, string $area): void
    {
        $stamp = CarbonImmutable::now();
        if ($area === 'messages') {
            $max = Message::query()->where('project_id', $project->id)->where('kind', '!=', 'system')->max('created_at');
            $stamp = $max !== null ? self::at($max) : $stamp;
        } else {
            $concepts = $project->clientVisibleConcepts();
            $candidates = array_filter([
                $concepts->max('created_at'), (clone $concepts)->max('updated_at'),
                ConceptComment::query()->where('project_id', $project->id)->max('created_at'),
            ]);
            if ($candidates !== []) {
                $stamp = collect($candidates)->map(fn ($d) => self::at($d))->max();
            }
        }
        $column = $area === 'messages' ? 'last_seen_messages_at' : 'last_seen_concepts_at';
        ProjectReadState::query()->updateOrCreate(['user_id' => $user->id, 'project_id' => $project->id], [$column => $stamp]);
    }

    private static function at(mixed $value): CarbonImmutable
    {
        return CarbonImmutable::parse($value instanceof \DateTimeInterface || is_string($value) ? $value : 'now', 'UTC')->utc();
    }

    /** @return array<string, mixed> */
    private static function shape(Message $m): array
    {
        $s = $m->sender;

        return [
            'id' => $m->id, 'kind' => $m->kind, 'body' => $m->body,
            'createdAt' => self::at($m->created_at)->format('Y-m-d\TH:i:s.v\Z'),
            'sender' => $s === null ? null : [
                'id' => $s->id, 'email' => $s->email, 'isAdmin' => (bool) $s->is_admin,
                'fullName' => $s->full_name, 'firstName' => $s->first_name, 'lastName' => $s->last_name,
            ],
        ];
    }
}

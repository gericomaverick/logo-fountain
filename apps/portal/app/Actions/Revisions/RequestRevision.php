<?php

namespace App\Actions\Revisions;

use App\Domain\ProjectState;
use App\Domain\ProjectTransitions;
use App\Exceptions\ApiException;
use App\Models\Message;
use App\Models\MessageThread;
use App\Models\Project;
use App\Models\RevisionRequest;
use App\Support\Audit;
use App\Support\DatabaseRoles;
use App\Support\Db;
use App\Support\ErrorCodes;
use App\Support\LifecycleMail;
use App\Support\LifecycleMessage;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB as Database;

/**
 * C-11 (`api/projects/[id]/revision-requests/route.ts` POST), N-12. One serializable transaction: the project row is
 * locked, the transition checked, the concept resolved (published only, DV-7: a hidden concept is a 400
 * CONCEPT_NOT_FOUND, byte-identical to an unknown one), one `revisions` entitlement reserved by a single guarded
 * UPDATE (so parallel requests can never reserve past the limit), then the request, status, system message and audit
 * rows. The admin email is queued after commit, once per request (marker keyed on the request id).
 */
final class RequestRevision
{
    public const MAX_LENGTH = 5000;

    /** @return array{revisionRequest: array<string, mixed>, project: array{id: string, status: string}} */
    public function __invoke(Project $project, string $userId, string $conceptId, string $body): array
    {
        return Db::serializable(fn () => $this->reserve($project, $userId, $conceptId, $body),
            fn () => new ApiException('Could not request revision', 409, 'STATUS_CHANGE_CONFLICT', ['nextStep' => 'Retry the revision request.']));
    }

    /** @return array{revisionRequest: array<string, mixed>, project: array{id: string, status: string}} */
    private function reserve(Project $project, string $userId, string $conceptId, string $body): array
    {
        $db = Database::connection(DatabaseRoles::RUNTIME);
        $row = $db->table('projects')->where('id', $project->id)->lockForUpdate()->first(['status', 'version']);
        if ($row === null) {
            throw new ApiException('Project not found', 404, ErrorCodes::PROJECT_NOT_FOUND, ['nextStep' => 'Check the project link.']);
        }
        $to = ProjectState::RevisionsInProgress->value;
        $transition = $row->status !== $to;
        if ($transition) {
            $applied = ProjectTransitions::apply($row->status, $to);
            if (! $applied->ok()) {
                throw new ApiException("Invalid transition from {$row->status} to {$to}", 400, ErrorCodes::INVALID_PROJECT_STATUS_TRANSITION,
                    ['allowed' => array_map(fn (ProjectState $s) => $s->value, $applied->allowed), 'nextStep' => 'Request revision when project is eligible.']);
            }
        }
        $concept = preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $conceptId) === 1
            ? $project->clientVisibleConcepts()->where('status', 'published')->whereKey($conceptId)->first() : null;
        if ($concept === null) {
            throw new ApiException('Concept not found for project', 400, ErrorCodes::CONCEPT_NOT_FOUND, ['nextStep' => 'Choose a concept from this project.']);
        }

        $reserved = $db->update(
            "UPDATE project_entitlements SET reserved_int = COALESCE(reserved_int, 0) + 1, updated_at = NOW()
             WHERE project_id = ? AND key = 'revisions' AND limit_int IS NOT NULL
               AND (COALESCE(consumed_int, 0) + COALESCE(reserved_int, 0)) < limit_int",
            [$project->id],
        );
        if ($reserved === 0) {
            throw new ApiException('No revisions remaining', 400, ErrorCodes::NO_REVISIONS_REMAINING, ['nextStep' => 'Buy a revision add-on to continue.']);
        }

        $request = RevisionRequest::create(['project_id' => $project->id, 'concept_id' => $concept->id, 'status' => 'requested', 'requested_by' => $userId, 'body' => $body]);
        $status = $row->status;
        if ($transition) {
            Db::guardedProjectUpdate($project->id, $row->status, (int) $row->version, ['status' => $to], fn () => new ApiException('Could not request revision', 409, 'STATUS_CHANGE_CONFLICT', ['nextStep' => 'Retry the revision request.']));
            $status = $to;
        }
        Audit::record('revision_requested', $project->id, $userId, ['revisionRequestId' => $request->id, 'conceptId' => $concept->id]);
        $this->systemMessage($project->id, $userId, 'Revision request received ('.substr($request->id, 0, 8).').');
        if ($transition) {
            Audit::record('state_changed', $project->id, $userId, ['previousStatus' => $row->status, 'nextStatus' => $to]);
        }

        // Inside the transaction (story 2.7): the job is queued after commit, the marker rolls back with a retry.
        LifecycleMail::sendOnce('admin_feedback_on_concept', $project->id, $request->id, LifecycleMessage::admin(
            'New concept feedback submitted', 'A client submitted revision feedback on a concept.', 'Open concept workflow', "/admin/projects/{$project->id}/concepts",
        ));

        return [
            'revisionRequest' => [
                'id' => $request->id, 'projectId' => $project->id, 'conceptId' => $concept->id, 'status' => 'requested', 'body' => $body,
                'createdAt' => CarbonImmutable::instance($request->created_at ?? now())->utc()->format('Y-m-d\TH:i:s.v\Z'),
            ],
            'project' => ['id' => $project->id, 'status' => $status],
        ];
    }

    private function systemMessage(string $projectId, string $fallbackUserId, string $text): void
    {
        $thread = MessageThread::query()->firstOrCreate(['project_id' => $projectId]);
        $admin = Database::connection(DatabaseRoles::RUNTIME)->table('profiles')->where('is_admin', true)->value('id');
        Message::create(['thread_id' => $thread->id, 'project_id' => $projectId, 'sender_id' => is_string($admin) ? $admin : $fallbackUserId, 'kind' => 'system', 'body' => $text]);
    }
}

<?php

namespace App\Actions\Approval;

use App\Domain\ProjectState;
use App\Domain\ProjectTransitions;
use App\Exceptions\ApiException;
use App\Models\Concept;
use App\Models\Project;
use App\Support\Audit;
use App\Support\DatabaseRoles;
use App\Support\Db;
use App\Support\ErrorCodes;
use App\Support\LifecycleMail;
use App\Support\LifecycleMessage;
use Illuminate\Support\Facades\DB as Database;

/**
 * C-12 (`api/projects/[id]/approve/route.ts` POST), N-07, N-08. One serializable transaction with the project row
 * locked: the concept must be `published` (else 404 CONCEPT_NOT_FOUND, DV-7), the transition to AWAITING_APPROVAL
 * checked, every other published or approved concept archived, this one approved, project status, audits and both
 * emails (marker keyed on the concept id, queued after commit) written. Next did these outside any lock; two parallel
 * approvals of different concepts could both pass, here the second sees AWAITING_APPROVAL and gets a 400.
 */
final class ApproveConcept
{
    /** @return array{concept: array{id: string, number: int, status: string}, project: array{id: string, status: string}} */
    public function __invoke(Project $project, string $userId, string $conceptId): array
    {
        return Db::serializable(fn () => $this->approve($project, $userId, $conceptId),
            fn () => new ApiException('Could not approve concept', 409, 'STATUS_CHANGE_CONFLICT', ['nextStep' => 'Retry the approval.']));
    }

    /** @return array{concept: array{id: string, number: int, status: string}, project: array{id: string, status: string}} */
    private function approve(Project $project, string $userId, string $conceptId): array
    {
        $db = Database::connection(DatabaseRoles::RUNTIME);
        $row = $db->table('projects')->where('id', $project->id)->lockForUpdate()->first(['status', 'version']);
        if ($row === null) {
            throw new ApiException('Project not found', 404, ErrorCodes::PROJECT_NOT_FOUND, ['nextStep' => 'Check the project link.']);
        }
        $concept = preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $conceptId) === 1
            ? $project->clientVisibleConcepts()->where('status', Concept::STATUS_PUBLISHED)->whereKey($conceptId)->first() : null;
        if ($concept === null) {
            throw new ApiException('Published concept not found', 404, ErrorCodes::CONCEPT_NOT_FOUND, ['nextStep' => 'Pick a published concept from this project.']);
        }
        $to = ProjectState::AwaitingApproval->value;
        $applied = ProjectTransitions::apply($row->status, $to);
        if (! $applied->ok()) {
            throw new ApiException("Invalid transition from {$row->status} to {$to}", 400, ErrorCodes::INVALID_PROJECT_STATUS_TRANSITION,
                ['allowed' => array_map(fn (ProjectState $s) => $s->value, $applied->allowed), 'nextStep' => 'Use an allowed project status transition.']);
        }

        Concept::query()->where('project_id', $project->id)->where('id', '!=', $concept->id)
            ->whereIn('status', [Concept::STATUS_PUBLISHED, Concept::STATUS_APPROVED])->update(['status' => Concept::STATUS_ARCHIVED]);
        $concept->update(['status' => Concept::STATUS_APPROVED]);
        Db::guardedProjectUpdate($project->id, $row->status, (int) $row->version, ['status' => $to], fn () => new ApiException('Could not approve concept', 409, 'STATUS_CHANGE_CONFLICT', ['nextStep' => 'Retry the approval.']));
        Audit::record('concept_approved', $project->id, $userId, ['conceptId' => $concept->id, 'conceptNumber' => $concept->number]);
        Audit::record('state_changed', $project->id, $userId, ['previousStatus' => $row->status, 'nextStatus' => $to]);

        LifecycleMail::sendOnce('client_concept_approved', $project->id, $concept->id, LifecycleMessage::client(
            'Concept approved - final files in progress', 'Great choice. Your approved concept has been confirmed and final deliverables are now being prepared.',
            'View project timeline', "/project/{$project->id}",
        ));
        LifecycleMail::sendOnce('admin_concept_approved', $project->id, $concept->id, LifecycleMessage::admin(
            'Client approved a concept', 'Nice update. A client has approved a concept and this project is ready for final deliverables.',
            'Open project', "/admin/projects/{$project->id}",
        ));

        return [
            'concept' => ['id' => $concept->id, 'number' => (int) $concept->number, 'status' => Concept::STATUS_APPROVED],
            'project' => ['id' => $project->id, 'status' => $to],
        ];
    }
}

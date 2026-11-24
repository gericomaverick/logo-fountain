<?php

namespace App\Actions\Brief;

use App\Actions\Messages\PostSystemMessage;
use App\Exceptions\ApiException;
use App\Models\Project;
use App\Models\ProjectBrief;
use App\Support\Audit;
use App\Support\DatabaseRoles;
use App\Support\Db;
use App\Support\ErrorCodes;
use Illuminate\Support\Facades\DB as Database;

/**
 * C-07 (`api/projects/[id]/brief/route.ts` POST): the one brief per project. Version 1, status BRIEF_SUBMITTED, the draft
 * deleted, the system message, two audit rows. No email (N-13); no further status effects (N-15).
 */
final class SubmitBrief
{
    public const SYSTEM_MESSAGE = 'Brief received. Your designer will review and reply soon.';

    /**
     * @param  array<string, string>  $answers
     * @return array{briefId: string, version: int}
     */
    public function __invoke(Project $project, string $userId, array $answers): array
    {
        $locked = fn (): ApiException => new ApiException(
            "Brief has already been submitted for project {$project->id}", 400, ErrorCodes::BRIEF_LOCKED, ['nextStep' => 'Brief can only be submitted once.'],
        );

        return Db::serializable(function () use ($project, $userId, $answers, $locked): array {
            $row = Database::connection(DatabaseRoles::RUNTIME)->table('projects')->where('id', $project->id)->lockForUpdate()->first(['status', 'version']);
            if ($row === null) {
                throw new ApiException('Project not found', 404, ErrorCodes::PROJECT_NOT_FOUND, ['nextStep' => 'Check the project link.']);
            }
            if ($row->status !== 'AWAITING_BRIEF' || ProjectBrief::query()->where('project_id', $project->id)->exists()) {
                throw $locked();
            }
            $brief = ProjectBrief::create(['project_id' => $project->id, 'version' => 1, 'answers' => (object) $answers, 'created_by' => $userId]);
            Db::guardedProjectUpdate($project->id, 'AWAITING_BRIEF', (int) $row->version, ['status' => 'BRIEF_SUBMITTED'], $locked);
            Database::connection(DatabaseRoles::RUNTIME)->table('project_brief_drafts')->where('project_id', $project->id)->delete();
            PostSystemMessage::post($project->id, $userId, self::SYSTEM_MESSAGE);
            Audit::record('brief_submitted', $project->id, $userId, ['briefId' => $brief->id, 'version' => 1, 'isResubmission' => false]);
            Audit::record('state_changed', $project->id, $userId, ['previousStatus' => 'AWAITING_BRIEF', 'nextStatus' => 'BRIEF_SUBMITTED']);

            return ['briefId' => $brief->id, 'version' => 1];
        }, fn () => new ApiException('Could not submit brief', 409, ErrorCodes::BRIEF_CONFLICT, ['nextStep' => 'Retry submitting the brief.']));
    }
}

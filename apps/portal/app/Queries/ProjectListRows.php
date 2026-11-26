<?php

namespace App\Queries;

use App\Domain\BriefAnswers;
use App\Domain\ProjectStatus;
use App\Models\Concept;
use App\Models\Project;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;

/** Story 6.1 (C-01): the Projects list rows, in a fixed number of queries whatever the project count. */
final class ProjectListRows
{
    /**
     * Slim rows, batched (no per-project snapshot, no signed URLs): status as the snapshot derives it, the brand name
     * from the latest brief, and the new flags from `ProjectSnapshot::activity`.
     *
     * @param  Collection<int, Project>  $projects
     * @return array<int, array<string, mixed>>
     */
    public static function for(Collection $projects, string $userId): array
    {
        /** @var array<int, string> $ids */
        $ids = $projects->map(fn (Project $p) => $p->id)->all();
        $approved = DB::table('concepts')->whereIn('project_id', $ids)->where('status', Concept::STATUS_APPROVED)
            ->distinct()->pluck('project_id')->flip();
        $finals = DB::table('file_assets')->whereIn('project_id', $ids)->where('kind', 'final_zip')
            ->distinct()->pluck('project_id')->flip();
        $briefs = DB::table('project_briefs')->whereIn('project_id', $ids)->orderBy('project_id')->orderByDesc('version')
            ->selectRaw('distinct on (project_id) project_id, answers')->pluck('answers', 'project_id');
        $activity = ProjectSnapshot::activity($ids, $userId);

        return $projects->map(function (Project $p) use ($approved, $finals, $briefs, $activity) {
            $hasApproved = isset($approved[$p->id]);
            $finalAvailable = isset($finals[$p->id]) && $hasApproved && in_array($p->status, ['FINAL_FILES_READY', 'DELIVERED'], true);
            $answers = isset($briefs[$p->id]) && is_string($briefs[$p->id]) ? BriefAnswers::parse(json_decode($briefs[$p->id])) : null;
            $brand = is_array($answers) && is_string($answers['brandName'] ?? null) ? trim($answers['brandName']) : '';

            return [
                'id' => $p->id,
                'status' => ProjectStatus::display($p->status, $hasApproved, $finalAvailable),
                'packageCode' => $p->package_code,
                'name' => $brand !== '' ? $brand : null,
                'hasNewConcepts' => $activity[$p->id]['hasNewConcepts'],
                'hasNewMessages' => $activity[$p->id]['hasNewMessages'],
            ];
        })->values()->all();
    }
}

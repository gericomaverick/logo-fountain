<?php

namespace App\Http\Controllers\Api;

use App\Actions\Brief\SubmitBrief;
use App\Domain\BriefAnswers;
use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Http\Middleware\EnforceSessionCap;
use App\Models\Project;
use App\Models\ProjectBrief;
use App\Models\ProjectBriefDraft;
use App\Models\User;
use App\Policies\ProjectPolicy;
use App\Support\ErrorCodes;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * C-06 (draft GET/PUT/DELETE) and C-07 (brief GET/POST): `api/projects/[id]/brief/route.ts`, `brief/draft/route.ts`.
 * The brief is readable by an admin or a member; the draft and the submit by a member only (nobody reads an unsent brief).
 */
final class ProjectBriefController extends Controller
{
    public function show(Request $request, string $id): JsonResponse
    {
        $user = $this->user($request);
        $project = $this->project($id, $user, admin: true);
        $brief = ProjectBrief::query()->where('project_id', $project->id)->orderByDesc('version')->first();

        return response()->json(['brief' => $brief === null ? null : [
            'id' => $brief->id, 'version' => $brief->version, 'answers' => $brief->answers,
            'createdAt' => $this->iso($brief->created_at), 'createdBy' => $brief->created_by,
        ]]);
    }

    public function submit(Request $request, string $id, SubmitBrief $submit): JsonResponse
    {
        $user = $this->user($request);
        $body = json_decode($request->getContent(), false);
        $answers = BriefAnswers::parse(is_object($body) ? $body : null);
        $missing = $answers === null ? ['brandName', 'industry', 'offerSummary'] : BriefAnswers::missing($answers);
        if ($answers === null || $missing !== []) {
            throw new ApiException('Invalid brief payload', 400, ErrorCodes::INVALID_BRIEF_PAYLOAD, ['nextStep' => 'Fill all required brief fields ('.implode(', ', $missing).').']);
        }
        $project = $this->project($id, $user);

        return response()->json(['ok' => true, ...$submit($project, $user->id, $answers)]);
    }

    public function draft(Request $request, string $id): JsonResponse
    {
        $project = $this->project($id, $this->user($request));
        $draft = ProjectBriefDraft::query()->where('project_id', $project->id)->first();
        $answers = $draft === null ? null : BriefAnswers::normalize($draft->answers);

        return response()->json(['draft' => $draft === null || $answers === null ? null : ['answers' => $answers, 'updatedAt' => $this->iso($draft->updated_at)]]);
    }

    public function saveDraft(Request $request, string $id): JsonResponse
    {
        $user = $this->user($request);
        $project = $this->project($id, $user);
        $body = json_decode($request->getContent(), false);
        $answers = is_object($body) && isset($body->answers) ? BriefAnswers::normalize($body->answers) : null;
        if ($answers === null) {
            throw new ApiException('Invalid draft payload', 400, ErrorCodes::INVALID_BRIEF_DRAFT_PAYLOAD, ['nextStep' => 'Send the brief answers object.']);
        }
        if ($project->status !== 'AWAITING_BRIEF') {
            throw new ApiException("Brief has already been submitted for project {$project->id}", 400, ErrorCodes::BRIEF_LOCKED, ['nextStep' => 'Brief can only be submitted once.']);
        }
        $draft = ProjectBriefDraft::query()->updateOrCreate(['project_id' => $project->id], ['answers' => (object) $answers, 'updated_by' => $user->id]);

        return response()->json(['ok' => true, 'updatedAt' => $this->iso($draft->updated_at)]);
    }

    public function discardDraft(Request $request, string $id): JsonResponse
    {
        $project = $this->project($id, $this->user($request));
        ProjectBriefDraft::query()->where('project_id', $project->id)->delete();

        return response()->json(['ok' => true]);
    }

    private function project(string $id, User $user, bool $admin = false): Project
    {
        $uuid = preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $id) === 1;
        $project = $uuid ? Project::query()->find($id) : null;
        $policy = new ProjectPolicy;
        if ($project === null || ! ($admin ? $policy->view($user, $project) : $policy->participate($user, $project))->allowed()) {
            throw new ApiException('Project not found', 404, ErrorCodes::PROJECT_NOT_FOUND, ['nextStep' => 'Check the project link.']);
        }

        return $project;
    }

    private function iso(mixed $date): string
    {
        return CarbonImmutable::parse($date instanceof \DateTimeInterface || is_string($date) ? $date : 'now', 'UTC')->utc()->format('Y-m-d\TH:i:s.v\Z');
    }

    private function user(Request $request): User
    {
        $user = $request->attributes->get(EnforceSessionCap::USER);
        if (! $user instanceof User) {
            throw new ApiException('Unauthorized', 401, ErrorCodes::UNAUTHORIZED, ['nextStep' => 'Sign in and retry.']);
        }

        return $user;
    }
}

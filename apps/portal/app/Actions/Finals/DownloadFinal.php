<?php

namespace App\Actions\Finals;

use App\Domain\ProjectState;
use App\Domain\ProjectTransitions;
use App\Exceptions\ApiException;
use App\Support\Audit;
use App\Support\Db;
use App\Support\ErrorCodes;
use App\Support\FinalDeliverableFilename;
use App\Support\Storage\PrivateStorage;
use Carbon\CarbonImmutable;
use Illuminate\Database\Connection;

/**
 * C-13 (`api/projects/[id]/finals/route.ts` POST). One serializable transaction: the project row is read and locked
 * only if the user is a member, the status is FINAL_FILES_READY or DELIVERED, a concept is approved and a `final_zip`
 * exists. The first download moves FINAL_FILES_READY to DELIVERED through the version guard (audit `state_changed`,
 * reason `client_final_zip_download`); a DELIVERED project is only locked, never rewritten. The URL is signed inside
 * the transaction from the newest final asset (created_at, id), so none is returned if the transaction rolls back.
 * A lost guard or a serialization failure is a 409 FINAL_DOWNLOAD_CONFLICT.
 */
final class DownloadFinal
{
    public const TTL_SECONDS = 3600;

    private const DOWNLOADABLE = ['FINAL_FILES_READY', 'DELIVERED'];

    public function __construct(private readonly PrivateStorage $storage) {}

    /** @return array{url: string}|null null = FINAL_ZIP_NOT_AVAILABLE */
    public function __invoke(string $projectId, string $userId): ?array
    {
        return Db::serializable(fn (Connection $db) => $this->run($db, $projectId, $userId), fn () => self::conflict());
    }

    /** @return array{url: string}|null */
    private function run(Connection $db, string $projectId, string $userId): ?array
    {
        $project = $db->table('projects')->where('projects.id', $projectId)
            ->whereIn('status', self::DOWNLOADABLE)
            ->whereExists(fn ($q) => $q->selectRaw('1')->from('client_memberships')
                ->whereColumn('client_memberships.client_id', 'projects.client_id')->where('client_memberships.user_id', $userId))
            ->whereExists(fn ($q) => $q->selectRaw('1')->from('concepts')
                ->whereColumn('concepts.project_id', 'projects.id')->where('concepts.status', 'approved'))
            ->whereExists(fn ($q) => $q->selectRaw('1')->from('file_assets')
                ->whereColumn('file_assets.project_id', 'projects.id')->where('file_assets.kind', 'final_zip'))
            ->lockForUpdate()->first(['projects.id', 'projects.status', 'projects.version', 'projects.client_id']);
        if ($project === null) {
            return null;
        }
        $file = $db->table('file_assets')->where('project_id', $project->id)->where('kind', 'final_zip')
            ->orderByDesc('created_at')->orderByDesc('id')->first(['id', 'path', 'created_at']);
        if ($file === null) {
            throw self::conflict();
        }

        if ($project->status === ProjectState::FinalFilesReady->value) {
            $to = ProjectState::Delivered->value;
            if (! ProjectTransitions::apply($project->status, $to)->ok()) {
                throw self::conflict();
            }
            Db::guardedProjectUpdate($project->id, $project->status, (int) $project->version, ['status' => $to], fn () => self::conflict());
            Audit::record('state_changed', $project->id, $userId, [
                'previousStatus' => $project->status, 'nextStatus' => $to, 'reason' => 'client_final_zip_download',
            ]);
        }

        $client = $db->table('clients')->where('id', $project->client_id)->first(['name']);
        $members = $db->table('client_memberships')->join('profiles', 'profiles.id', '=', 'client_memberships.user_id')
            ->where('client_memberships.client_id', $project->client_id)->orderBy('client_memberships.created_at')
            ->get(['client_memberships.role', 'profiles.first_name', 'profiles.last_name', 'profiles.full_name', 'profiles.email']);
        $owner = $members->first(fn ($m) => strtolower((string) $m->role) === 'owner') ?? $members->first();
        $name = null;
        if ($owner !== null) {
            $joined = trim(implode(' ', array_filter([$owner->first_name, $owner->last_name], fn ($p) => $p !== null && $p !== '')));
            $name = $joined !== '' ? $joined : (trim((string) $owner->full_name) ?: null);
        }
        $fileName = FinalDeliverableFilename::build($client?->name, $name, $owner?->email, CarbonImmutable::parse($file->created_at, 'UTC'));

        return ['url' => $this->storage->sign(PrivateStorage::FINAL_DELIVERABLES, $file->path, self::TTL_SECONDS, $fileName)];
    }

    private static function conflict(): ApiException
    {
        return new ApiException('Final download state changed; retry from the refreshed project', 409, ErrorCodes::FINAL_DOWNLOAD_CONFLICT, ['nextStep' => 'Refresh the project before retrying.']);
    }
}

<?php

namespace App\Models;

use App\Models\Concerns\HasMillisecondTimestamps;
use Database\Factories\ConceptFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Scope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Statuses are free text in the schema (`brownfield/data-model-and-ops.md:19`). Client paths see only
 * CLIENT_VISIBLE_STATUSES, through `visibleToClient()` (ADR-020). The scope is local on purpose: admin
 * lifecycle routes read every status (`brownfield/api-admin.md:49-53`).
 *
 * @property string $id
 * @property string $project_id
 * @property int $number
 * @property string $status
 * @property string|null $notes
 * @property-read Project $project
 */
#[Fillable(['project_id', 'number', 'status', 'notes'])]
class Concept extends Model
{
    /** @use HasFactory<ConceptFactory> */
    use HasFactory, HasMillisecondTimestamps, HasUuids;

    public const STATUS_DRAFT = 'draft';

    public const STATUS_PUBLISHED = 'published';

    public const STATUS_APPROVED = 'approved';

    public const STATUS_ARCHIVED = 'archived';

    public const STATUS_DELETED = 'deleted';

    /** Next's PUBLISHED_OR_APPROVED (`apps/web/src/lib/project-snapshot.ts:11`). */
    public const CLIENT_VISIBLE_STATUSES = [self::STATUS_PUBLISHED, self::STATUS_APPROVED];

    public function isVisibleToClient(): bool
    {
        return in_array($this->status, self::CLIENT_VISIBLE_STATUSES, true);
    }

    /**
     * This concept's files (`kind = concept`, matched by path as Next does: there is no concept_id column).
     * A query, not a relation: it depends on this instance's ids, so it can't be eager-loaded.
     *
     * @return Builder<FileAsset>
     */
    public function assets(): Builder
    {
        $prefix = $this->project_id.'/'.$this->id;

        return FileAsset::query()
            ->where('file_assets.project_id', $this->project_id)
            ->where('file_assets.kind', FileAsset::KIND_CONCEPT)
            ->where(fn (Builder $paths) => $paths
                ->whereRaw('starts_with(file_assets.path, ?)', [$prefix.'.'])
                ->orWhereRaw('starts_with(file_assets.path, ?)', [$prefix.'/v']));
    }

    /** @return BelongsTo<Project, $this> */
    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /** @return HasMany<ConceptComment, $this> */
    public function comments(): HasMany
    {
        return $this->hasMany(ConceptComment::class);
    }

    /** @return HasMany<RevisionRequest, $this> */
    public function revisionRequests(): HasMany
    {
        return $this->hasMany(RevisionRequest::class);
    }

    /** @param  Builder<self>  $query */
    #[Scope]
    protected function visibleToClient(Builder $query): void
    {
        $query->whereIn($query->qualifyColumn('status'), self::CLIENT_VISIBLE_STATUSES);
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['number' => 'integer'];
    }
}

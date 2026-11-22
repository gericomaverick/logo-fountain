<?php

namespace App\Models;

use App\Models\Concerns\HasMillisecondTimestamps;
use Database\Factories\ProjectFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Query\Builder;

/**
 * `version` is the ADR-011 optimistic-lock counter: not fillable, bumped only by the story 2.4 guard.
 *
 * Client paths reach concepts and concept files **only** through `clientVisibleConcepts()` and
 * `clientVisibleAssets()` (ADR-020, DV-7; `tests/Arch/ClientConceptScopeTest.php`).
 *
 * @property string $id
 * @property string $client_id
 * @property string $status
 * @property string $package_code
 * @property int $version
 * @property-read Client $client
 */
#[Fillable(['client_id', 'status', 'package_code'])]
class Project extends Model
{
    /** @use HasFactory<ProjectFactory> */
    use HasFactory, HasMillisecondTimestamps, HasUuids;

    /** Membership as Next's requireProjectMembership (`lib/auth/require.ts:49-61`): the project's client has the user as a member. */
    public function hasMember(User $user): bool
    {
        return ClientMembership::query()
            ->where('client_id', $this->client_id)
            ->where('user_id', $user->id)
            ->exists();
    }

    /**
     * Concepts a client may see (published, approved), for admins on client paths too
     * (`api/projects/[id]/concepts/route.ts:37`). A hidden concept's id resolves exactly like an unknown one.
     *
     * @return HasMany<Concept, $this>
     */
    public function clientVisibleConcepts(): HasMany
    {
        return $this->concepts()->visibleToClient();
    }

    /**
     * Concept files a client may see: `kind = concept` files under a client-visible concept's path
     * (`<projectId>/<conceptId>.<ext>` legacy or `<projectId>/<conceptId>/v<n>.<ext>`, as Next's
     * `concepts/[conceptId]/assets/route.ts:49-57`). Final ZIPs are never reachable here.
     *
     * @return HasMany<FileAsset, $this>
     */
    public function clientVisibleAssets(): HasMany
    {
        return $this->fileAssets()
            ->where('file_assets.kind', FileAsset::KIND_CONCEPT)
            ->whereExists(fn (Builder $query) => $query->selectRaw('1')->from('concepts')
                ->whereColumn('concepts.project_id', 'file_assets.project_id')
                ->whereIn('concepts.status', Concept::CLIENT_VISIBLE_STATUSES)
                ->where(fn (Builder $paths) => $paths
                    ->whereRaw("starts_with(file_assets.path, concepts.project_id::text || '/' || concepts.id::text || '.')")
                    ->orWhereRaw("starts_with(file_assets.path, concepts.project_id::text || '/' || concepts.id::text || '/v')")));
    }

    /** @return BelongsTo<Client, $this> */
    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    /** @return HasMany<Concept, $this> every status: admin paths only */
    public function concepts(): HasMany
    {
        return $this->hasMany(Concept::class);
    }

    /** @return HasMany<FileAsset, $this> every file: admin paths only */
    public function fileAssets(): HasMany
    {
        return $this->hasMany(FileAsset::class);
    }

    /** @return HasMany<ProjectBrief, $this> */
    public function briefs(): HasMany
    {
        return $this->hasMany(ProjectBrief::class);
    }

    /** @return HasOne<ProjectBriefDraft, $this> */
    public function briefDraft(): HasOne
    {
        return $this->hasOne(ProjectBriefDraft::class);
    }

    /** @return HasMany<ProjectOrder, $this> */
    public function orders(): HasMany
    {
        return $this->hasMany(ProjectOrder::class);
    }

    /** @return HasMany<ProjectEntitlement, $this> */
    public function entitlements(): HasMany
    {
        return $this->hasMany(ProjectEntitlement::class);
    }

    /** @return HasOne<MessageThread, $this> */
    public function messageThread(): HasOne
    {
        return $this->hasOne(MessageThread::class);
    }

    /** @return HasMany<Message, $this> */
    public function messages(): HasMany
    {
        return $this->hasMany(Message::class);
    }

    /** @return HasMany<RevisionRequest, $this> */
    public function revisionRequests(): HasMany
    {
        return $this->hasMany(RevisionRequest::class);
    }

    /** @return HasMany<ConceptComment, $this> */
    public function conceptComments(): HasMany
    {
        return $this->hasMany(ConceptComment::class);
    }

    /** @return HasMany<AuditEvent, $this> */
    public function auditEvents(): HasMany
    {
        return $this->hasMany(AuditEvent::class);
    }

    /** @return HasMany<ProjectReadState, $this> */
    public function readStates(): HasMany
    {
        return $this->hasMany(ProjectReadState::class);
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['version' => 'integer'];
    }
}

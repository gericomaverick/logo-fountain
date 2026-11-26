<?php

namespace App\Queries;

use App\Domain\BriefAnswers;
use App\Domain\ProjectState;
use App\Domain\ProjectStatus;
use App\Domain\ProjectTimeline;
use App\Models\Concept;
use App\Models\FileAsset;
use App\Models\Project;
use App\Support\Storage\SignedImage;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * C-02: the canonical project snapshot (`lib/project-snapshot.ts`), one query object for the polled JSON and, later,
 * the page props (arch §4.2). Key set and types: `tests/parity/fixtures/contracts/snapshot.schema.json`. Keys Next
 * serialises from `undefined` are absent here, not null. Concepts come only through the client-visible scopes (ADR-020).
 * `concepts[].imageKey` is the additive DV-12 key.
 */
final class ProjectSnapshot
{
    private const array PACKAGE_DEFAULTS = ['essential' => 1, 'professional' => 2, 'complete' => 3];

    /**
     * @return array<string, mixed>
     */
    public static function for(Project $project, ?string $userId): array
    {
        $pid = $project->id;
        $persisted = $project->status;

        $entRows = DB::table('project_entitlements')->where('project_id', $pid)->whereIn('key', ['concepts', 'revisions'])->get();
        $usage = self::usage($entRows->all(), $project->package_code);

        $concepts = $project->clientVisibleConcepts()->orderByDesc('number')->orderByDesc('created_at')->get();
        $assets = $project->clientVisibleAssets()->orderByDesc('created_at')->orderByDesc('id')->get();
        $finalAsset = DB::table('file_assets')->where('project_id', $pid)->where('kind', 'final_zip')
            ->orderByDesc('created_at')->orderByDesc('id')->first();

        // Newest asset per concept wins; the version is the highest `v<n>.` seen (`:197-215`).
        $files = [];
        $versions = [];
        foreach ($assets as $asset) {
            $parts = explode('/', $asset->path);
            $name = end($parts);
            $conceptId = count($parts) >= 3 ? $parts[1] : explode('.', $name)[0];
            if ($conceptId === '') {
                continue;
            }
            $v = preg_match('/^v(\d+)\./', $name, $m) === 1 ? (int) $m[1] : 1;
            $v = $v > 0 ? $v : 1;
            $versions[$conceptId] = max($versions[$conceptId] ?? 0, $v);
            $files[$conceptId] ??= $asset;
        }

        $conceptItems = [];
        foreach ($concepts as $concept) {
            $signed = isset($files[$concept->id]) ? SignedImage::for($files[$concept->id]) : null;
            $conceptItems[] = [
                'id' => $concept->id, 'number' => $concept->number, 'status' => $concept->status, 'notes' => $concept->notes,
                'createdAt' => self::iso($concept->created_at), 'updatedAt' => self::iso($concept->updated_at),
                'revisionVersion' => max($versions[$concept->id] ?? 0, 1),
                'imageUrl' => $signed['url'] ?? null,
            ] + ($signed !== null ? ['imageKey' => $signed['imageKey']] : []);
        }

        $hasApproved = $concepts->contains(fn ($c) => $c->status === 'approved');
        $finalAvailable = $finalAsset !== null && $hasApproved && in_array($persisted, ['FINAL_FILES_READY', 'DELIVERED'], true);
        $finalZip = ['available' => $finalAvailable, 'url' => null, 'assetId' => $finalAvailable ? $finalAsset->id : null];
        $status = ProjectStatus::display($persisted, $hasApproved, $finalAvailable);
        $state = ProjectState::tryFrom($status);

        $revisions = self::revisionRequests($pid);
        $timestamps = self::timestamps($project, $concepts->all(), $revisions['rows'], $concepts->firstWhere('status', 'approved'), $finalAvailable ? FileAsset::query()->whereKey($finalAsset->id)->first() : null);
        $timeline = ProjectTimeline::build($status, $timestamps, $hasApproved || $persisted === 'APPROVED');

        $activity = self::activity([$pid], $userId)[$pid];
        $latestMessageAt = $activity['latestMessageAt'];
        $latestConceptAt = $activity['latestConceptAt'];
        $seenMessages = $activity['seenMessages'];
        $seenConcepts = $activity['seenConcepts'];

        $order = DB::table('project_orders')->where('project_id', $pid)->orderByDesc('created_at')->first();
        $stuckReason = $order === null ? 'Missing order record (webhook likely never fulfilled).'
            : ($order->status === 'NEEDS_CONTACT' ? 'Order needs contact (no purchaser email provisioned).'
                : ($order->status !== 'FULFILLED' ? "Order status is {$order->status}." : null));

        $brief = DB::table('project_briefs')->where('project_id', $pid)->orderByDesc('version')->first();
        $answers = $brief !== null ? BriefAnswers::parse(json_decode($brief->answers)) : null;

        $snapshot = [
            'projectId' => $pid,
            'status' => $status,
            'overviewStatus' => ProjectStatus::overviewBadge($persisted, $hasApproved, $finalAvailable),
            'statusLabel' => $state?->label() ?? $status,
            'primaryCta' => $state?->primaryCta(),
            'timeline' => $timeline,
            'packageCode' => $project->package_code,
            'clientContact' => self::contact($project->client_id),
            'createdAt' => self::iso($project->created_at),
            'updatedAt' => self::iso($project->updated_at),
            'entitlements' => ['concepts' => $usage['concepts']['remaining'], 'revisions' => $usage['revisions']['remaining']],
            'entitlementUsage' => $usage,
            'concepts' => $conceptItems,
            'latestConcepts' => array_slice($conceptItems, 0, 5),
            'revisionRequests' => $revisions['items'],
            'latestRevisionRequests' => array_slice($revisions['items'], 0, 5),
            'messages' => self::messages($pid),
            'latestBrief' => $brief !== null && $answers !== null
                ? ['version' => $brief->version, 'createdAt' => self::iso(self::at($brief->created_at)), 'answers' => $answers] : null,
            'hasBriefDraft' => DB::table('project_brief_drafts')->where('project_id', $pid)->exists(),
            'finalZip' => $finalZip,
            'latestOrder' => $order === null ? null : [
                'id' => $order->id, 'status' => $order->status, 'stripeCheckoutSessionId' => $order->stripe_checkout_session_id,
                'createdAt' => self::iso(self::at($order->created_at)),
            ],
            'stuck' => $stuckReason !== null,
            'stuckReason' => $stuckReason,
            'recentAuditEventsCount' => DB::table('audit_events')->where('project_id', $pid)->count(),
            // An empty object, not [] (Next sends {} when neither timestamp is set).
            'readState' => (object) array_filter([
                'lastSeenMessagesAt' => $seenMessages !== null ? self::iso($seenMessages) : null,
                'lastSeenConceptsAt' => $seenConcepts !== null ? self::iso($seenConcepts) : null,
            ], fn ($v) => $v !== null),
            'hasNewMessages' => $activity['hasNewMessages'],
            'hasNewConcepts' => $activity['hasNewConcepts'],
        ];
        if ($latestMessageAt !== null) {
            $snapshot['latestMessageAt'] = self::iso($latestMessageAt);
        }
        if ($latestConceptAt !== null) {
            $snapshot['latestConceptAt'] = self::iso($latestConceptAt);
        }

        return $snapshot;
    }

    /**
     * The new-activity inputs for several projects in three queries (the list uses it too, so the "new" rule lives
     * once): latest non-system message, latest concept activity (a client-visible concept's created or updated time,
     * or the project's latest concept comment, only when it has a visible concept) and the user's read state.
     *
     * @param  array<int, string>  $projectIds
     * @return array<string, array{latestMessageAt: ?CarbonImmutable, latestConceptAt: ?CarbonImmutable, seenMessages: ?CarbonImmutable, seenConcepts: ?CarbonImmutable, hasNewMessages: bool, hasNewConcepts: bool}>
     */
    public static function activity(array $projectIds, ?string $userId): array
    {
        if ($projectIds === []) {
            return [];
        }
        $messages = DB::table('messages')->whereIn('project_id', $projectIds)->where('kind', '!=', 'system')
            ->groupBy('project_id')->selectRaw('project_id, max(created_at) as latest')->pluck('latest', 'project_id');
        $comments = DB::table('concept_comments')->whereIn('project_id', $projectIds)
            ->groupBy('project_id')->selectRaw('project_id, max(created_at) as latest')->pluck('latest', 'project_id');
        $concepts = DB::table('concepts')->whereIn('project_id', $projectIds)->whereIn('status', Concept::CLIENT_VISIBLE_STATUSES)
            ->groupBy('project_id')->selectRaw('project_id, max(created_at) as created, max(updated_at) as updated')->get()->keyBy('project_id');
        $reads = $userId !== null
            ? DB::table('project_read_states')->where('user_id', $userId)->whereIn('project_id', $projectIds)->get()->keyBy('project_id')
            : collect();

        $out = [];
        foreach ($projectIds as $id) {
            $latestMessageAt = self::at($messages[$id] ?? null);
            $latestConceptAt = null;
            if (isset($concepts[$id])) {
                foreach ([$concepts[$id]->created, $concepts[$id]->updated, $comments[$id] ?? null] as $candidate) {
                    $candidate = self::at($candidate);
                    if ($candidate !== null && ($latestConceptAt === null || $candidate->greaterThan($latestConceptAt))) {
                        $latestConceptAt = $candidate;
                    }
                }
            }
            $seenMessages = self::at($reads[$id]->last_seen_messages_at ?? null);
            $seenConcepts = self::at($reads[$id]->last_seen_concepts_at ?? null);
            $out[$id] = [
                'latestMessageAt' => $latestMessageAt, 'latestConceptAt' => $latestConceptAt,
                'seenMessages' => $seenMessages, 'seenConcepts' => $seenConcepts,
                'hasNewMessages' => $latestMessageAt !== null && ($seenMessages === null || $latestMessageAt->greaterThan($seenMessages)),
                'hasNewConcepts' => $latestConceptAt !== null && ($seenConcepts === null || $latestConceptAt->greaterThan($seenConcepts)),
            ];
        }

        return $out;
    }

    /**
     * C-16: remaining per key, 0 when no row (`entitlements/route.ts:19-28`; no package defaults here).
     *
     * @return array{concepts: int, revisions: int}
     */
    public static function entitlementRows(string $projectId): array
    {
        $out = ['concepts' => 0, 'revisions' => 0];
        foreach (DB::table('project_entitlements')->where('project_id', $projectId)->whereIn('key', ['concepts', 'revisions'])->get() as $row) {
            $out[$row->key === 'concepts' ? 'concepts' : 'revisions'] = (int) max(($row->limit_int ?? 0) - $row->consumed_int - ($row->reserved_int ?? 0), 0);
        }

        return $out;
    }

    /**
     * `lib/entitlements.ts`: rows win; package defaults only when neither row exists.
     *
     * @param  array<int, \stdClass>  $rows
     * @return array<string, array<string, mixed>>
     */
    public static function usage(array $rows, string $package): array
    {
        $usage = [
            'concepts' => ['limit' => 0, 'consumed' => 0, 'reserved' => 0, 'remaining' => 0, 'configured' => false],
            'revisions' => ['limit' => 0, 'consumed' => 0, 'reserved' => 0, 'remaining' => 0, 'configured' => false],
        ];
        foreach ($rows as $row) {
            $limit = max($row->limit_int ?? 0, 0);
            $consumed = max($row->consumed_int ?? 0, 0);
            $reserved = max($row->reserved_int ?? 0, 0);
            $usage[$row->key] = [
                'limit' => $limit, 'consumed' => $consumed, 'reserved' => $reserved,
                'remaining' => max($limit - $consumed - $reserved, 0), 'unlimited' => $row->limit_int === null, 'configured' => true,
            ];
        }
        if ($rows === [] && isset(self::PACKAGE_DEFAULTS[$package])) {
            $n = self::PACKAGE_DEFAULTS[$package];
            foreach (['concepts', 'revisions'] as $key) {
                $usage[$key] = ['limit' => $n, 'consumed' => 0, 'reserved' => 0, 'remaining' => $n, 'configured' => false];
            }
        }

        return $usage;
    }

    /**
     * @return array{items: array<int, array<string, mixed>>, rows: array<int, \stdClass>} newest 10
     */
    private static function revisionRequests(string $pid): array
    {
        $rows = DB::table('revision_requests as r')
            ->leftJoin('concepts as c', 'c.id', '=', 'r.concept_id')
            ->join('profiles as p', 'p.id', '=', 'r.requested_by')
            ->where('r.project_id', $pid)->orderByDesc('r.created_at')->orderByDesc('r.id')->limit(10)
            ->get(['r.id', 'r.status', 'r.body', 'r.created_at', 'r.updated_at', 'c.id as concept_id', 'c.number as concept_number',
                'p.id as user_id', 'p.email', 'p.full_name'])->values()->all();

        return ['rows' => $rows, 'items' => array_map(fn ($r) => [
            'id' => $r->id, 'status' => $r->status, 'body' => $r->body,
            'createdAt' => self::iso(self::at($r->created_at)), 'updatedAt' => self::iso(self::at($r->updated_at)),
            'concept' => $r->concept_id === null ? null : ['id' => $r->concept_id, 'number' => $r->concept_number],
            'user' => ['id' => $r->user_id, 'email' => $r->email, 'fullName' => $r->full_name],
        ], $rows)];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private static function messages(string $pid): array
    {
        return DB::table('messages as m')->join('profiles as p', 'p.id', '=', 'm.sender_id')->where('m.project_id', $pid)
            ->orderBy('m.created_at')->orderBy('m.id')
            ->get(['m.id', 'm.kind', 'm.body', 'm.created_at', 'p.id as sender_id', 'p.email', 'p.full_name'])
            ->map(fn ($m) => [
                'id' => $m->id, 'kind' => $m->kind, 'body' => $m->body, 'createdAt' => self::iso(self::at($m->created_at)),
                'sender' => ['id' => $m->sender_id, 'email' => $m->email, 'fullName' => $m->full_name],
            ])->values()->all();
    }

    /**
     * The owner (case-insensitive), else the first member (`getPrimaryClientContact`).
     *
     * @return array{fullName: string|null, email: string}|null
     */
    private static function contact(string $clientId): ?array
    {
        $members = DB::table('client_memberships as cm')->join('profiles as p', 'p.id', '=', 'cm.user_id')->where('cm.client_id', $clientId)
            ->orderBy('cm.created_at')->orderBy('cm.id')->get(['cm.role', 'p.first_name', 'p.last_name', 'p.full_name', 'p.email']);
        $primary = $members->first(fn ($m) => strtolower($m->role) === 'owner') ?? $members->first();
        if ($primary === null) {
            return null;
        }
        $composed = trim(implode(' ', array_filter([$primary->first_name, $primary->last_name], fn ($s) => $s !== null && $s !== '')));
        $name = $composed !== '' ? $composed : trim((string) $primary->full_name);

        return ['fullName' => $name !== '' ? $name : null, 'email' => $primary->email];
    }

    /**
     * Inferred step times, then the first `state_changed` audit per state wins (`:244-271`, `fetchAuditStateTimestamps`).
     *
     * @param  array<int, Concept>  $concepts
     * @param  array<int, \stdClass>  $revisions
     * @return array<string, string>
     */
    private static function timestamps(Project $project, array $concepts, array $revisions, ?Concept $approved, ?FileAsset $finalAsset): array
    {
        $t = [ProjectState::AwaitingBrief->value => self::iso($project->created_at)];
        if ($concepts !== []) {
            $t[ProjectState::ConceptsReady->value] = self::iso(collect($concepts)->map(fn ($c) => CarbonImmutable::instance($c->created_at ?? new \DateTimeImmutable('@0')))->sortBy(fn ($d) => $d->getTimestampMs())->first());
        }
        foreach ($revisions as $r) {
            if ($r->status === 'requested') {
                $t[ProjectState::RevisionsInProgress->value] = self::iso(self::at($r->created_at));
                break;
            }
        }
        foreach ($revisions as $r) {
            if ($r->status === 'delivered') {
                $t[ProjectState::ConceptsReady->value] ??= self::iso(self::at($r->updated_at));
                break;
            }
        }
        if ($approved !== null) {
            $t[ProjectState::AwaitingApproval->value] = self::iso($approved->updated_at);
        }
        if ($finalAsset !== null) {
            $t[ProjectState::FinalFilesReady->value] = self::iso(self::at($finalAsset->created_at));
        }
        $seen = [];
        foreach (DB::table('audit_events')->where('project_id', $project->id)->where('type', 'state_changed')->orderBy('created_at')->orderBy('id')->get(['payload', 'created_at']) as $row) {
            $payload = json_decode($row->payload);
            $next = is_object($payload) && isset($payload->nextStatus) && is_string($payload->nextStatus) ? $payload->nextStatus : null;
            if ($next !== null && ProjectState::tryFrom($next) !== null && ! isset($seen[$next])) {
                $seen[$next] = self::iso(self::at($row->created_at));
            }
        }

        return $seen + $t;
    }

    /** A `timestamp(3)` column value (stored UTC) as a date, or null. */
    private static function at(mixed $value): ?CarbonImmutable
    {
        return $value === null ? null : CarbonImmutable::parse(is_scalar($value) ? (string) $value : 'now', 'UTC');
    }

    private static function iso(?\DateTimeInterface $date): string
    {
        return CarbonImmutable::instance($date ?? new \DateTimeImmutable('@0'))->utc()->format('Y-m-d\TH:i:s.v\Z');
    }
}

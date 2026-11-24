<?php

namespace App\Queries;

use App\Models\Concept;
use App\Models\FileAsset;
use App\Models\Project;
use App\Support\Storage\SignedImage;
use Carbon\CarbonImmutable;

/**
 * C-08 / C-09 payloads. Concepts only through `Project::clientVisibleConcepts()` (ADR-020, DV-7);
 * every image carries the DV-12 `imageKey`.
 */
final class ClientConcepts
{
    /**
     * @return list<array<string, mixed>>
     */
    public static function list(Project $project): array
    {
        $items = [];
        foreach ($project->clientVisibleConcepts()->orderBy('number')->orderBy('created_at')->get() as $concept) {
            $newest = self::versions($concept)[0] ?? null;
            // Next signs the first file by createdAt desc, not the highest version (route.ts:75-77).
            $latest = self::versions($concept, false)[0] ?? null;
            $items[] = [
                'id' => $concept->id, 'number' => $concept->number, 'status' => $concept->status, 'notes' => $concept->notes,
                'createdAt' => self::iso($concept->created_at), 'updatedAt' => self::iso($concept->updated_at),
                'revisionVersion' => max($newest['version'] ?? 1, 1),
                'imageUrl' => $latest['signed']['url'] ?? null,
            ] + (isset($latest['signed']) ? ['imageKey' => $latest['signed']['imageKey']] : []);
        }

        return $items;
    }

    public static function find(Project $project, string $conceptId): ?Concept
    {
        return $project->clientVisibleConcepts()->whereKey($conceptId)->first();
    }

    /**
     * @return list<array<string, mixed>>
     */
    public static function assets(Concept $concept): array
    {
        $assets = [];
        foreach (self::versions($concept) as $row) {
            $assets[] = [
                'path' => $row['asset']->path, 'version' => $row['version'], 'createdAt' => self::iso($row['asset']->created_at),
                'url' => $row['signed']['url'] ?? null, 'notes' => $row['asset']->notes,
            ] + (isset($row['signed']) ? ['imageKey' => $row['signed']['imageKey']] : []);
        }

        return $assets;
    }

    /**
     * Every file of a visible concept, version desc then newest first.
     *
     * @return list<array{asset: FileAsset, version: int, signed: array{imageKey: string, url: string, expiresAt: int}|null}>
     */
    private static function versions(Concept $concept, bool $byVersion = true): array
    {
        $rows = [];
        foreach ($concept->assets()->orderByDesc('file_assets.created_at')->orderByDesc('file_assets.id')->get() as $asset) {
            $v = preg_match('/^v(\d+)\./', basename($asset->path), $m) === 1 ? (int) $m[1] : 1;
            $rows[] = ['asset' => $asset, 'version' => $v > 0 ? $v : 1, 'signed' => SignedImage::for($asset)];
        }
        if ($byVersion) {
            usort($rows, fn (array $a, array $b) => $b['version'] <=> $a['version']);
        }

        return $rows;
    }

    private static function iso(?\DateTimeInterface $date): string
    {
        return CarbonImmutable::instance($date ?? new \DateTimeImmutable('@0'))->utc()->format('Y-m-d\TH:i:s.v\Z');
    }
}

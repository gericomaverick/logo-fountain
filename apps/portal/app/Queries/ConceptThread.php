<?php

namespace App\Queries;

use App\Models\ConceptComment;
use App\Models\Profile;
use Carbon\CarbonImmutable;

/**
 * C-10: a concept's comment thread (`concepts/[conceptId]/comments/route.ts`). Takes ids of a concept already resolved
 * through the client-visible scope (DV-7), so it never widens it. The author comes from the profile; `isAdmin` is
 * only read, never written (DV-14), so an admin reply is a plain insert.
 */
final class ConceptThread
{
    public const MAX_LENGTH = 2000;

    /** @return list<array<string, mixed>> */
    public static function list(string $projectId, string $conceptId): array
    {
        $rows = ConceptComment::query()->with('author')
            ->where('project_id', $projectId)->where('concept_id', $conceptId)
            ->orderBy('created_at')->orderBy('id')->get()
            ->all();

        return array_values(array_map(fn (ConceptComment $c): array => self::present($c), $rows));
    }

    /** @return array<string, mixed> */
    public static function add(string $projectId, string $conceptId, string $authorId, string $body): array
    {
        $comment = ConceptComment::create(['project_id' => $projectId, 'concept_id' => $conceptId, 'author_id' => $authorId, 'body' => $body]);

        return self::present($comment->load('author'));
    }

    /** @return array<string, mixed> */
    private static function present(ConceptComment $c): array
    {
        $a = $c->author;
        $date = $c->created_at;

        return [
            'id' => $c->id,
            'body' => $c->body,
            'createdAt' => CarbonImmutable::instance($date)->utc()->format('Y-m-d\TH:i:s.v\Z'),
            'author' => ['id' => $a instanceof Profile ? $a->id : $c->author_id, 'email' => $a?->email, 'fullName' => $a?->full_name, 'isAdmin' => $a?->is_admin === true],
        ];
    }
}

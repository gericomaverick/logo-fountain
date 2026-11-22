<?php

namespace Tests\Fixtures\Arch\Scoped;

use App\Models\Project;

/** Story 2.2 fixture: the allowed shape, concepts reached only through Project's scoped relation. */
final class ScopedClientController
{
    public function show(Project $project, string $conceptId): bool
    {
        return $project->clientVisibleConcepts()->whereKey($conceptId)->exists();
    }
}

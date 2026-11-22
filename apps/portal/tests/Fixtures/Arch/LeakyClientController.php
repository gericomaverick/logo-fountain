<?php

namespace Tests\Fixtures\Arch;

use App\Models\Concept;
use App\Models\Project;

/** Story 2.2 negative fixture: a "client controller" that looks a concept up by id, outside the scope. */
final class LeakyClientController
{
    public function show(string $conceptId): ?Concept
    {
        return Concept::query()->find($conceptId);
    }

    public function viaRelation(Project $project, string $id): mixed
    {
        // Comments may name ->asset without tripping the scan.
        $project->concepts()->findOrFail($id);

        return $project->fileAssets()->find($id);
    }
}

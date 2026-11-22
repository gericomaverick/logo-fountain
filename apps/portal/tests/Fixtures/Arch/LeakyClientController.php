<?php

namespace Tests\Fixtures\Arch;

use App\Models\Concept;

/** Story 2.2 negative fixture: a "client controller" that looks a concept up by id, outside the scope. */
final class LeakyClientController
{
    public function show(string $conceptId): ?Concept
    {
        return Concept::query()->find($conceptId);
    }
}

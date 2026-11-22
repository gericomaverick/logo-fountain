<?php

namespace Tests\Fixtures\Arch\Scoped\Admin;

use App\Models\FileAsset;

/** Story 2.2 fixture: an Admin sub-namespace under a scoped namespace; ignored by the rule. */
final class AdminFileController
{
    public function file(string $fileId): ?FileAsset
    {
        return FileAsset::query()->find($fileId);
    }
}

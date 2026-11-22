<?php

namespace App\Models;

use App\Models\Concerns\HasMillisecondTimestamps;
use Database\Factories\FileAssetFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * An uploaded object (`kind`: concept or final_zip; `bucket` is the logical namespace). Client paths
 * never look one up by id: they use `Project::clientVisibleAssets()` or a visible concept's `assets()`.
 *
 * @property string $id
 * @property string $project_id
 * @property string $kind
 * @property string $bucket
 * @property string $path
 * @property string $mime
 * @property int $size
 * @property string|null $notes
 * @property string $uploaded_by
 */
#[Fillable(['project_id', 'kind', 'bucket', 'path', 'mime', 'size', 'notes', 'uploaded_by'])]
class FileAsset extends Model
{
    /** @use HasFactory<FileAssetFactory> */
    use HasFactory, HasMillisecondTimestamps, HasUuids;

    public const KIND_CONCEPT = 'concept';

    public const KIND_FINAL_ZIP = 'final_zip';

    /** @return BelongsTo<Project, $this> */
    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /** @return BelongsTo<Profile, $this> */
    public function uploader(): BelongsTo
    {
        return $this->belongsTo(Profile::class, 'uploaded_by');
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['size' => 'integer'];
    }
}

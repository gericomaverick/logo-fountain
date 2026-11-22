<?php

namespace Database\Factories;

use App\Models\Concept;
use App\Models\FileAsset;
use App\Models\Profile;
use App\Models\Project;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<FileAsset>
 */
class FileAssetFactory extends Factory
{
    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'project_id' => Project::factory(),
            'kind' => FileAsset::KIND_CONCEPT,
            'bucket' => 'concepts',
            'path' => fn (array $attributes): string => $attributes['project_id'].'/'.fake()->uuid().'/v1.png',
            'mime' => 'image/png',
            'size' => 1024,
            'uploaded_by' => Profile::factory(),
        ];
    }

    /** A concept file at Next's versioned path `<projectId>/<conceptId>/v<n>.png`. */
    public function forConcept(Concept $concept, int $version = 1): static
    {
        return $this->state([
            'project_id' => $concept->project_id,
            'kind' => FileAsset::KIND_CONCEPT,
            'path' => "{$concept->project_id}/{$concept->id}/v{$version}.png",
        ]);
    }
}

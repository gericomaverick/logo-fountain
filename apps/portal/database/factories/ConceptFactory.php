<?php

namespace Database\Factories;

use App\Models\Concept;
use App\Models\Project;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Concept>
 */
class ConceptFactory extends Factory
{
    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'project_id' => Project::factory(),
            'number' => function (array $attributes): int {
                $max = Concept::query()->where('project_id', $attributes['project_id'])->max('number');

                return is_numeric($max) ? (int) $max + 1 : 1;
            },
            'status' => Concept::STATUS_DRAFT,
        ];
    }

    public function status(string $status): static
    {
        return $this->state(['status' => $status]);
    }
}

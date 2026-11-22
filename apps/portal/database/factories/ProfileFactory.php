<?php

namespace Database\Factories;

use App\Models\Profile;
use App\Models\User;
use App\Support\DatabaseRoles;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * A profile with its user (same id, same email).
 *
 * @extends Factory<Profile>
 */
class ProfileFactory extends Factory
{
    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'id' => User::factory(),
            'email' => fn (array $attributes): string => User::query()->whereKey($attributes['id'])->firstOrFail()->email,
            'full_name' => fake()->name(),
        ];
    }

    public function unverified(): static
    {
        return $this->state(['id' => User::factory()->unverified()]);
    }

    /**
     * Sets `is_admin` the only way the schema allows: as the table owner (`pgsql_migrate`, ADR-009 trigger),
     * never through the model. The row must be committed, so use it with the committed-rows harness
     * (`TruncatesDatabaseAsOwner`), not inside a RefreshDatabase transaction (the update would miss the row).
     */
    public function admin(): static
    {
        return $this->afterCreating(function (Profile $profile): void {
            if (DB::connection(DatabaseRoles::MIGRATE)->table('profiles')->where('id', $profile->id)->update(['is_admin' => true]) !== 1) {
                throw new RuntimeException('ProfileFactory::admin() needs a committed profile row (use TruncatesDatabaseAsOwner).');
            }
            $profile->refresh();
        });
    }
}

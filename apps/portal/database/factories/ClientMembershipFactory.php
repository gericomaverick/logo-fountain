<?php

namespace Database\Factories;

use App\Models\Client;
use App\Models\ClientMembership;
use App\Models\Profile;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ClientMembership>
 */
class ClientMembershipFactory extends Factory
{
    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'client_id' => Client::factory(),
            'user_id' => Profile::factory(),
            'role' => 'owner',
        ];
    }
}

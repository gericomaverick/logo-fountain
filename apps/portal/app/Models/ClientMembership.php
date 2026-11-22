<?php

namespace App\Models;

use App\Models\Concerns\HasMillisecondTimestamps;
use Database\Factories\ClientMembershipFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A profile's membership of a client (`user_id` references `profiles`). Created only, never updated.
 *
 * @property string $id
 * @property string $client_id
 * @property string $user_id
 * @property string $role
 */
#[Fillable(['client_id', 'user_id', 'role'])]
class ClientMembership extends Model
{
    /** @use HasFactory<ClientMembershipFactory> */
    use HasFactory, HasMillisecondTimestamps, HasUuids;

    public const UPDATED_AT = null;

    /** @return BelongsTo<Client, $this> */
    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    /** @return BelongsTo<Profile, $this> */
    public function profile(): BelongsTo
    {
        return $this->belongsTo(Profile::class, 'user_id');
    }
}

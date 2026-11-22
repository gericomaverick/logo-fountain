<?php

namespace App\Models;

use App\Models\Concerns\HasMillisecondTimestamps;
use App\Models\Concerns\NormalisesEmail;
use Database\Factories\ProfileFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * Keyed by the user's id (no generated key): create it through `$user->profile()->create([...])`.
 * `is_admin` is operator-owned (DV-14, ADR-009): not fillable, no setter, never written by model code.
 * The 2.1 trigger `protect_operator_admin_flag` refuses it on the runtime role anyway.
 *
 * @property string $id
 * @property string $email
 * @property string|null $full_name
 * @property string|null $first_name
 * @property string|null $last_name
 * @property bool $is_admin
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read User $user
 */
#[Fillable(['email', 'full_name', 'first_name', 'last_name'])]
class Profile extends Model
{
    /** @use HasFactory<ProfileFactory> */
    use HasFactory, HasMillisecondTimestamps, NormalisesEmail;

    public $incrementing = false;

    protected $keyType = 'string';

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'id');
    }

    /** @return HasMany<ClientMembership, $this> */
    public function memberships(): HasMany
    {
        return $this->hasMany(ClientMembership::class, 'user_id');
    }

    /** @return HasMany<ProjectReadState, $this> */
    public function readStates(): HasMany
    {
        return $this->hasMany(ProjectReadState::class, 'user_id');
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['is_admin' => 'boolean'];
    }
}

<?php

namespace App\Models;

use App\Models\Concerns\HasMillisecondTimestamps;
use App\Models\Concerns\NormalisesEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Carbon;

/**
 * The login identity (Next `AuthUser`). The portal profile, including the operator-owned admin flag,
 * lives on `profiles` with the same id.
 *
 * @property string $id
 * @property string $name
 * @property string $email
 * @property Carbon|null $email_verified_at
 * @property string|null $image
 * @property string|null $password
 * @property int $credential_version
 * @property-read Profile|null $profile
 */
#[Fillable(['name', 'email', 'image', 'password'])]
#[Hidden(['password'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, HasMillisecondTimestamps, HasUuids, NormalisesEmail, Notifiable;

    /** `users` has no remember_token column (2.1): Auth::login($u, true) must not write one. */
    protected $rememberTokenName = '';

    /**
     * "Admin" as Next's isAdminUser (`apps/web/src/lib/auth/admin.ts:4`): a verified email **and**
     * `profiles.is_admin`. An unverified admin is an ordinary user. The one place this is decided
     * (ProjectPolicy, ConceptPolicy and later the admin middleware use it).
     */
    public function isAdmin(): bool
    {
        return $this->email_verified_at !== null && $this->profile?->is_admin === true;
    }

    /** @return HasOne<Profile, $this> */
    public function profile(): HasOne
    {
        return $this->hasOne(Profile::class, 'id');
    }

    /** @return HasMany<AuthProof, $this> */
    public function authProofs(): HasMany
    {
        return $this->hasMany(AuthProof::class);
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'credential_version' => 'integer',
        ];
    }
}

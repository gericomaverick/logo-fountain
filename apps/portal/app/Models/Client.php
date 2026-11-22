<?php

namespace App\Models;

use App\Models\Concerns\HasMillisecondTimestamps;
use Database\Factories\ClientFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property string $id
 * @property string $name
 * @property string $slug
 * @property string|null $billing_email
 * @property string|null $vat_number
 */
#[Fillable(['name', 'slug', 'billing_email', 'vat_number'])]
class Client extends Model
{
    /** @use HasFactory<ClientFactory> */
    use HasFactory, HasMillisecondTimestamps, HasUuids;

    /** @return HasMany<ClientMembership, $this> */
    public function memberships(): HasMany
    {
        return $this->hasMany(ClientMembership::class);
    }

    /** @return HasMany<Project, $this> */
    public function projects(): HasMany
    {
        return $this->hasMany(Project::class);
    }

    /** @return HasMany<ProjectOrder, $this> */
    public function orders(): HasMany
    {
        return $this->hasMany(ProjectOrder::class);
    }
}

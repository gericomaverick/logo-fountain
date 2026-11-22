<?php

namespace App\Models;

use App\Models\Concerns\HasMillisecondTimestamps;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * A single-use auth proof (ADR-006), keyed by the token hash; never holds the token itself.
 *
 * @property string $token_hash
 * @property string $user_id
 * @property string $kind
 * @property int $credential_version
 * @property Carbon $expires_at
 */
#[Fillable(['token_hash', 'user_id', 'kind', 'credential_version', 'expires_at'])]
class AuthProof extends Model
{
    use HasMillisecondTimestamps;

    protected $primaryKey = 'token_hash';

    public $incrementing = false;

    protected $keyType = 'string';

    public $timestamps = false;

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'credential_version' => 'integer',
            'expires_at' => 'datetime',
        ];
    }
}

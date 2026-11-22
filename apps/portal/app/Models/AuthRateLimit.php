<?php

namespace App\Models;

use App\Models\Concerns\HasMillisecondTimestamps;
use App\Support\DatabaseRoles;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * A rate-limit bucket. Always on the limits connection (never inside a business transaction, ADR-013);
 * used only from `Support/RateLimits` (story 2.5).
 *
 * @property string $key
 * @property int $hits
 * @property Carbon $window_start
 */
#[Fillable(['key', 'hits', 'window_start'])]
class AuthRateLimit extends Model
{
    use HasMillisecondTimestamps;

    protected $connection = DatabaseRoles::LIMITS;

    protected $primaryKey = 'key';

    public $incrementing = false;

    protected $keyType = 'string';

    public $timestamps = false;

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'hits' => 'integer',
            'window_start' => 'datetime',
        ];
    }
}

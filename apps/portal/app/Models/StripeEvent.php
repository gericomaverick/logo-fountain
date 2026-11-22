<?php

namespace App\Models;

use App\Models\Concerns\HasMillisecondTimestamps;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * A received Stripe event, keyed by its id. `created_at` is the Stripe event time, set by the caller
 * (not an Eloquent timestamp); `type` also holds the processing lease marker.
 *
 * @property string $event_id
 * @property string $type
 * @property Carbon $created_at
 * @property Carbon|null $processed_at
 */
#[Fillable(['event_id', 'type', 'created_at', 'processed_at'])]
class StripeEvent extends Model
{
    use HasMillisecondTimestamps;

    protected $primaryKey = 'event_id';

    public $incrementing = false;

    protected $keyType = 'string';

    public $timestamps = false;

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
            'processed_at' => 'datetime',
        ];
    }
}

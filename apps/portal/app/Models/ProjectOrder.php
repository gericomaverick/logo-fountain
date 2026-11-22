<?php

namespace App\Models;

use App\Models\Concerns\HasMillisecondTimestamps;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property string $id
 * @property string $project_id
 * @property string $client_id
 * @property string $status
 * @property string $currency
 * @property int $total_cents
 * @property string|null $stripe_checkout_session_id
 * @property string|null $stripe_payment_intent_id
 * @property string|null $campaign_slug
 */
#[Fillable(['project_id', 'client_id', 'status', 'currency', 'total_cents', 'stripe_checkout_session_id', 'stripe_payment_intent_id', 'campaign_slug'])]
class ProjectOrder extends Model
{
    use HasMillisecondTimestamps, HasUuids;

    /** @return BelongsTo<Project, $this> */
    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    /** @return BelongsTo<Client, $this> */
    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'total_cents' => 'integer',
        ];
    }
}

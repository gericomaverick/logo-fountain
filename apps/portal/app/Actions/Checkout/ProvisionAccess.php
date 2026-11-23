<?php

namespace App\Actions\Checkout;

use App\Models\ClientMembership;
use App\Models\Profile;
use App\Models\User;
use App\Support\DatabaseRoles;
use App\Support\Locks;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * K-06 (`ensureAccessProvisioning`, `checkout-fulfillment.ts:438-465`): after payment, the purchaser gets a user, a
 * profile and an owner membership. Payment is not mailbox proof: a new user is unverified and nothing here ever sets
 * `is_admin`. `needsSetup` is durable state (no password yet), not "the user was new on this attempt".
 */
final class ProvisionAccess
{
    public function handle(string $clientId, string $purchaserEmail, ?string $firstName, ?string $lastName): ProvisionedAccess
    {
        $email = CheckoutSessionData::email($purchaserEmail) ?? throw new RuntimeException('Purchaser email required');
        $first = CheckoutSessionData::text($firstName);
        $last = CheckoutSessionData::text($lastName);
        $full = CheckoutSessionData::text(implode(' ', array_filter([$first, $last], fn ($p) => $p !== null)));

        return DB::connection(DatabaseRoles::RUNTIME)->transaction(function () use ($clientId, $email, $first, $last, $full): ProvisionedAccess {
            Locks::provision($email);
            $client = DB::connection(DatabaseRoles::RUNTIME)->table('clients')->where('id', $clientId)->first();
            $paid = DB::connection(DatabaseRoles::RUNTIME)->table('project_orders')->where('client_id', $clientId)->where('status', 'FULFILLED')->exists();
            if ($client === null || CheckoutSessionData::email($client->billing_email) !== $email || ! $paid) {
                throw new RuntimeException('Verified paid client required before access provisioning');
            }

            $user = User::query()->where('email', $email)->first();
            $existed = $user !== null;
            $user ??= User::create(['name' => $full ?? $email, 'email' => $email]);

            $profile = Profile::query()->find($user->id);
            if ($profile === null) {
                $profile = new Profile(['email' => $email, 'full_name' => $full, 'first_name' => $first, 'last_name' => $last]);
                $profile->id = $user->id;
            } else {
                $profile->fill(array_filter(['first_name' => $first, 'last_name' => $last, 'full_name' => $full], fn ($v) => $v !== null));
            }
            $profile->save();

            ClientMembership::query()->firstOrCreate(['client_id' => $clientId, 'user_id' => $user->id], ['role' => 'owner']);

            $password = $user->password;

            return new ProvisionedAccess($user->id, $existed, $password === null || $password === '');
        });
    }
}

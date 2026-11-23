<?php

namespace App\Actions\Checkout;

use App\Actions\Auth\SendAuthLink;
use App\Models\User;
use App\Support\Audit;
use App\Support\DatabaseRoles;
use App\Support\LifecycleMail;
use App\Support\LifecycleMessage;
use App\Support\Locks;
use App\Support\Stripe\FulfilmentError;
use Closure;
use Illuminate\Support\Facades\DB;

/**
 * N-01 / N-02 / N-10 (story 5.3 AC 9-11; `webhook/route.ts:148-207`), shared with reprocess (5.6, ADR-015): the
 * customer sign-in or setup email and the admin new-project email, each at most once. Each step runs in its own
 * transaction under the session's advisory lock, held from the marker check to the marker write, so the webhook and
 * a reprocess serialise and the second sees the marker. A crash between send and marker resends on retry (Next's
 * at-least-once behaviour, accepted). A send that fails leaves no marker, so the retry sends it.
 */
final class CompleteFulfilmentSideEffects
{
    /** @param Closure(): void $renew */
    public function handle(string $sessionId, string $projectId, ?string $userId, bool $needsSetup, bool $newProject, Closure $renew): void
    {
        if ($userId !== null) {
            $this->customerEmail($sessionId, $projectId, $userId, $needsSetup, $renew);
        }
        if ($newProject) {
            $this->adminEmail($sessionId, $projectId, $renew);
        }
    }

    /** @param Closure(): void $renew */
    private function customerEmail(string $sessionId, string $projectId, string $userId, bool $needsSetup, Closure $renew): void
    {
        $marker = LifecycleMail::markerType('checkout_auth', $sessionId);
        DB::connection(DatabaseRoles::RUNTIME)->transaction(function () use ($sessionId, $projectId, $userId, $needsSetup, $renew, $marker): void {
            Locks::fulfilSideEffects($sessionId);
            $sent = DB::connection(DatabaseRoles::RUNTIME)->table('audit_events')->where('project_id', $projectId)->where('type', $marker)->exists();
            if ($sent) {
                return;
            }
            $renew();
            if (! SendAuthLink::configured()) {
                if (app()->environment('production')) {
                    throw new FulfilmentError('Required checkout customer email was skipped', 'CUSTOMER_EMAIL_SKIPPED');
                }

                return; // tolerated outside production; no marker, so a configured retry sends it
            }
            app(SendAuthLink::class)->handle(User::query()->findOrFail($userId), $needsSetup ? 'setup' : 'magic', "/project/{$projectId}");
            Audit::record($marker, $projectId, null, ['checkoutSessionId' => $sessionId]);
        });
    }

    /** @param Closure(): void $renew */
    private function adminEmail(string $sessionId, string $projectId, Closure $renew): void
    {
        DB::connection(DatabaseRoles::RUNTIME)->transaction(function () use ($sessionId, $projectId, $renew): void {
            Locks::fulfilSideEffects($sessionId);
            $renew();
            $result = LifecycleMail::sendOnce('admin_new_project', $projectId, null, LifecycleMessage::admin(
                'New project created',
                'A new Logo Fountain project has been created and is ready for intake.',
                'Open project',
                "/admin/projects/{$projectId}",
            ));
            if ($result->status === 'skipped' && app()->environment('production')) {
                throw new FulfilmentError('Required new-project admin email was skipped', 'ADMIN_EMAIL_SKIPPED');
            }
        });
    }
}

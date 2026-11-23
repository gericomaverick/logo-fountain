import { useState } from 'react';

import { ResendLink } from '@/Components/ResendLink';
import { Button } from '@/Components/ui/Button';
import { InlineAlert } from '@/Components/ui/InlineAlert';
import { PollingStatus } from '@/Components/ui/PollingStatus';
import { usePolling } from '@/hooks/usePolling';
import { AuthShell } from '@/Layouts/AuthShell';
import { fetchStatus } from '@/lib/checkout';
import { checkoutInterval, POLL_INTERVALS } from '@/lib/polling';

/** K-02: polls every 2 s, every 10 s after 45 s with a "still waiting" panel (customer-safe copy, DV-22). */
export default function Success() {
    const sessionId = new URLSearchParams(window.location.search).get('session_id')?.trim() ?? '';
    const [started] = useState(() => Date.now());
    const polling = usePolling({
        interval: checkoutInterval,
        immediate: true,
        enabled: sessionId !== '',
        key: sessionId,
        fetch: (signal) => fetchStatus(sessionId, signal),
        stopWhen: (data) => data.fulfilled,
    });
    const fulfilled = polling.data?.fulfilled === true;
    const slow = !fulfilled && Date.now() - started >= POLL_INTERVALS.checkoutSlowAfter;

    if (!sessionId) {
        return (
            <AuthShell title="Payment received">
                <InlineAlert tone="danger" announce>Missing checkout session. Please return to pricing and try again.</InlineAlert>
            </AuthShell>
        );
    }
    return (
        <AuthShell title={fulfilled ? 'Your order is ready' : 'Confirming your payment…'} subtitle={fulfilled ? 'Check your email for a sign-in link.' : 'This usually takes a few seconds.'}>
            <PollingStatus reconnecting={polling.reconnecting} announcement={polling.announcement} />
            {polling.error && !fulfilled ? <InlineAlert tone="danger" announce>We couldn’t check your order just now. We’ll keep trying.</InlineAlert> : null}
            {slow ? (
                <div className="flex flex-col gap-3" data-testid="still-waiting">
                    <h2 className="text-lg font-medium">Still waiting for confirmation</h2>
                    <p className="text-sm text-fg-2">Payment confirmations can take a little longer. Your order is safe; you can leave this page open or check your email shortly. If nothing arrives, contact support with your session reference.</p>
                    <Button type="button" variant="secondary" onClick={polling.refresh}>Retry now</Button>
                </div>
            ) : null}
            <ResendLink sessionId={sessionId} />
        </AuthShell>
    );
}

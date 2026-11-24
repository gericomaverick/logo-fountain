import { useState } from 'react';

import { InlineAlert } from '@/Components/ui/InlineAlert';
import { usePolling } from '@/hooks/usePolling';
import { purchaseCopy, purchaseFromSearch, purchaseInterval, type PurchaseState } from '@/lib/upsell';

/**
 * Story 6.4 (K-10): back from Stripe with `?upsell=1&session_id=…`, say the purchase is being confirmed, poll
 * GET /api/checkout/status (2.5 s, then 7 s) and say when it is confirmed. `onConfirmed` lets the page refresh
 * its allowances at once. It is a polite live region: it never takes focus.
 */
export function PurchaseBanner({ search, onConfirmed }: { search: string; onConfirmed: () => void }) {
    const [purchase] = useState(() => purchaseFromSearch(search));
    const [state, setState] = useState<PurchaseState>('confirming');
    const polling = usePolling<boolean>({
        enabled: purchase !== null,
        key: purchase?.sessionId ?? 'none',
        interval: purchaseInterval,
        immediate: true,
        stopWhen: (done) => done,
        fetch: async (signal) => {
            const res = await fetch(`/api/checkout/status?session_id=${encodeURIComponent(purchase?.sessionId ?? '')}`, { cache: 'no-store', signal, headers: { Accept: 'application/json' }, credentials: 'same-origin' });
            if (!res.ok) throw new Error('status');
            const body = (await res.json()) as { fulfilled?: boolean };
            if (body.fulfilled === true) {
                setState('confirmed');
                onConfirmed();
                return true;
            }
            return false;
        },
    });

    if (!purchase) return null;
    const shown: PurchaseState = state === 'confirmed' ? 'confirmed' : polling.reconnecting ? 'delayed' : 'confirming';
    const copy = purchaseCopy(shown, purchase.kind);
    return (
        // One polite live region whose role never changes (some screen readers miss a role switch), so the
        // alert inside is static and the text change is what is announced.
        <div data-testid="purchase-banner" data-state={shown} role="status">
            <InlineAlert tone={shown === 'confirmed' ? 'success' : shown === 'delayed' ? 'danger' : 'warning'} title={copy.title}>
                {copy.body}
            </InlineAlert>
        </div>
    );
}

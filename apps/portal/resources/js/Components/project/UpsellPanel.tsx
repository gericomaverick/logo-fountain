import { useState, useSyncExternalStore } from 'react';

import { Button } from '@/Components/ui/Button';
import { InlineAlert } from '@/Components/ui/InlineAlert';
import { DISMISS_MS, dismissKey, isDismissed, resolveUpsellOffer, upgradeLabel, upgradePrice, UPSELL_PRICES, type PackageTarget } from '@/lib/upsell';

/**
 * Story 6.3 (C-04, K-08; UX §7 "Allowance exhausted"): the add-on and the eligible upgrade, each with its
 * price, when revisions run low. Neither is the page's primary action (the turn banner owns that), so both are
 * secondary buttons. "Not now" hides the panel for 24 h in this browser session (sessionStorage expiry, as
 * revision-purchase.tsx does). A purchase POSTs the checkout session and leaves for the hosted Stripe page.
 */
type Props = {
    projectId: string;
    packageCode: string | undefined;
    revisions: { remaining: number; reserved: number };
};

type Mode = 'addon' | 'upgrade';

async function readError(res: Response): Promise<string> {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string; details?: { nextStep?: string } } | string } | null;
    const err = body?.error;
    const message = typeof err === 'string' ? err : (err?.message ?? 'Unable to start checkout');
    const next = typeof err === 'string' ? undefined : err?.details?.nextStep;
    return next ? `${message}. ${next}` : message;
}

export function UpsellPanel({ projectId, packageCode, revisions }: Props) {
    const key = dismissKey(projectId, packageCode);
    const [dismissedNow, setDismissedNow] = useState(false);
    // Read through useSyncExternalStore: storage is outside React and the server has no answer (third argument).
    const stored = useSyncExternalStore(
        (onChange) => {
            window.addEventListener('storage', onChange);
            return () => window.removeEventListener('storage', onChange);
        },
        () => {
            try {
                return isDismissed(window.sessionStorage.getItem(key), Date.now());
            } catch {
                return false; // site data blocked: nothing is dismissed
            }
        },
        () => false,
    );
    const [submitting, setSubmitting] = useState<Mode | null>(null);
    const [error, setError] = useState<string | null>(null);

    const offer = resolveUpsellOffer(revisions, packageCode);
    if (stored || dismissedNow || (!offer.addon && offer.upgradeTo === null)) return null;

    const dismiss = () => {
        try {
            window.sessionStorage.setItem(key, String(Date.now() + DISMISS_MS));
        } catch {
            // Not being able to remember it is no reason to ignore the click.
        }
        setDismissedNow(true);
    };

    const start = async (body: Record<string, unknown>, mode: Mode) => {
        setSubmitting(mode);
        setError(null);
        try {
            const res = await fetch(`/api/projects/${projectId}/checkout/session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error(await readError(res));
            const payload = (await res.json().catch(() => null)) as { url?: string } | null;
            if (!payload?.url) throw new Error('Checkout URL missing');
            window.location.assign(payload.url);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Unable to start checkout');
            setSubmitting(null);
        }
    };

    const target: PackageTarget | null = offer.upgradeTo;
    return (
        <section aria-labelledby="upsell-title" className="flex flex-col gap-4 rounded-lg border border-accent/30 bg-accent-soft p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                    <h2 id="upsell-title" className="text-lg font-semibold text-fg">
                        Need more flexibility?
                    </h2>
                    <p className="max-w-prose text-base text-fg-2">{offer.message}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={dismiss}>
                    Not now
                </Button>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                {offer.addon ? (
                    <Button variant="secondary" width="phone" loading={submitting === 'addon'} loadingLabel="Redirecting…" disabledReason={undefined} onClick={() => void start({ kind: 'addon', addonKey: 'extra_revision' }, 'addon')}>
                        {`Buy extra revision (${UPSELL_PRICES.extraRevision})`}
                    </Button>
                ) : null}
                {target ? (
                    <Button variant="secondary" width="phone" loading={submitting === 'upgrade'} loadingLabel="Redirecting…" onClick={() => void start({ kind: 'upgrade', toPackage: target }, 'upgrade')}>
                        {`Upgrade to ${upgradeLabel(target)} (${upgradePrice(target)})`}
                    </Button>
                ) : null}
            </div>
            {error ? <InlineAlert tone="danger" announce>{error}</InlineAlert> : null}
        </section>
    );
}

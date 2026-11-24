// Pure rules behind the Overview's upsell panel and purchase banner (stories 6.3, 6.4; C-04, K-08, K-10).
// No imports, so tests/js runs it under node:test. Source: apps/web lib/project-hub.ts (resolveUpsellOffer),
// components/revision-purchase.tsx (prices, 24 h dismissal), project-hub.tsx (2.5 s then 7 s status polling).

export type PackageTarget = 'professional' | 'complete';

/** Display copy for the allow-listed prices (K-08); the server checks the real price ids. */
export const UPSELL_PRICES = { extraRevision: '£95', professional: '£495', complete: '£750' } as const;

export const DISMISS_MS = 24 * 60 * 60 * 1000;

export type RevisionStanding = { remaining: number; reserved: number };
export type UpsellOffer = { addon: boolean; upgradeTo: PackageTarget | null; message: string };

export function nextPackageUp(packageCode: string | undefined | null): PackageTarget | null {
    return packageCode === 'essential' ? 'professional' : packageCode === 'professional' ? 'complete' : null;
}

/** The add-on only with nothing left; the upgrade with one or none left. */
export function resolveUpsellOffer(revisions: RevisionStanding, packageCode: string | undefined | null): UpsellOffer {
    const remaining = Math.max(revisions.remaining, 0);
    const target = nextPackageUp(packageCode);
    const addon = remaining <= 0;
    return {
        addon,
        upgradeTo: target !== null && remaining <= 1 ? target : null,
        message: addon
            ? 'You’ve used every revision in your package. Add one more now, or upgrade for extra headroom.'
            : revisions.reserved > 0
              ? 'You have one revision left, and one already with your designer. Upgrade now to avoid being held up later.'
              : 'You have one revision left. Upgrade now to avoid being held up later.',
    };
}

/** The panel belongs to the phases where feedback happens (project-hub.tsx:104). */
export function inUpsellPhase(status: string): boolean {
    return status === 'CONCEPTS_READY' || status === 'REVISIONS_IN_PROGRESS' || status === 'AWAITING_APPROVAL';
}

export function upgradePrice(target: PackageTarget): string {
    return UPSELL_PRICES[target];
}
export function upgradeLabel(target: PackageTarget): string {
    return target === 'professional' ? 'Professional' : 'Complete';
}

export const dismissKey = (projectId: string, packageCode: string | undefined | null) => `upsell:dismissed:${projectId}:${packageCode ?? 'unknown'}`;

/** A stored expiry (epoch ms as text) still in the future. Anything unreadable is "not dismissed". */
export function isDismissed(raw: string | null | undefined, now: number): boolean {
    if (!raw) return false;
    const expiresAt = Number.parseInt(raw, 10);
    return Number.isFinite(expiresAt) && now < expiresAt;
}

// ---------- Purchase confirmation (K-10) ----------
export type PurchaseKind = 'addon' | 'upgrade';
export type PurchaseState = 'confirming' | 'confirmed' | 'delayed';

export const PURCHASE_FIRST_MS = 2_500;
export const PURCHASE_THEN_MS = 7_000;

/** Next's schedule: the first wait is 2.5 s, every wait after that 7 s (project-hub.tsx:193). */
export function purchaseInterval(elapsedMs: number): number {
    return elapsedMs < PURCHASE_FIRST_MS ? PURCHASE_FIRST_MS : PURCHASE_THEN_MS;
}

export function purchaseCopy(state: PurchaseState, kind: PurchaseKind | null): { title: string; body: string } {
    if (state === 'confirmed') {
        return {
            title: 'Purchase confirmed',
            body: kind === 'upgrade' ? 'Upgrade confirmed. Your package and limits are updated.' : 'Add-on confirmed. Your extra revision is now available.',
        };
    }
    if (state === 'delayed') return { title: 'Purchase confirmation delayed', body: 'Could not confirm your purchase yet. Refresh the page in a moment.' };
    return { title: 'Confirming your purchase', body: 'Payment received. We’re waiting for confirmation, which usually takes a few seconds.' };
}

/** `?upsell=1&session_id=…` (DV-5 success URL): the session to follow, else null. */
export function purchaseFromSearch(search: string): { sessionId: string; kind: PurchaseKind | null } | null {
    const p = new URLSearchParams(search);
    const sessionId = p.get('upsell') === '1' ? (p.get('session_id')?.trim() ?? '') : '';
    if (!sessionId) return null;
    const kind = p.get('kind');
    return { sessionId, kind: kind === 'addon' || kind === 'upgrade' ? kind : null };
}

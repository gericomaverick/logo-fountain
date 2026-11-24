import { Head, Link as InertiaLink, router } from '@inertiajs/react';
import { FileText, Folder } from 'lucide-react';

import { PurchaseBanner } from '@/Components/project/PurchaseBanner';
import { UpsellPanel } from '@/Components/project/UpsellPanel';
import { AllowanceMeter } from '@/Components/ui/AllowanceMeter';
import { Panel } from '@/Components/ui/Card';
import { Link } from '@/Components/ui/Link';
import { PollingStatus } from '@/Components/ui/PollingStatus';
import { StageTracker } from '@/Components/ui/StageTracker';
import { TurnBanner } from '@/Components/ui/TurnBanner';
import { usePolling } from '@/hooks/usePolling';
import { CustomerShell, type CustomerSection } from '@/Layouts/CustomerShell';
import { logoutAndVerifySession } from '@/lib/auth';
import { POLL_INTERVALS } from '@/lib/polling';
import { bannerCopy, type EntitlementUsage, type TimelineItem } from '@/lib/status';
import { inUpsellPhase } from '@/lib/upsell';

/**
 * Story 6.2b (C-03; UX §2.5, §14): the project Overview. Order: turn banner with its one primary action,
 * stage tracker, allowances (used / in progress / left), recent activity, shortcuts. Polls the snapshot every
 * 10 s (usePolling); images are not on this page, so nothing is re-downloaded.
 */
type Message = { id: string; kind: string; body: string; createdAt: string };
type Snapshot = {
    id: string;
    status: string;
    packageCode: string;
    timeline: TimelineItem[];
    entitlementUsage: { concepts: EntitlementUsage; revisions: EntitlementUsage };
    messages?: Message[];
    updatedAt?: string;
    latestBrief?: { answers?: { brandName?: string } } | null;
    finalZip?: { available?: boolean } | null;
};
type Props = { projectId: string; snapshot: Snapshot; user: { name: string; email: string } };

const PRIMARY_HREF: Record<string, string> = {
    AWAITING_BRIEF: 'brief',
    CONCEPTS_READY: 'concepts',
    FINAL_FILES_READY: 'files',
    ON_HOLD: 'messages',
};

export default function Overview({ projectId, snapshot: initial, user }: Props) {
    const base = `/project/${projectId}`;
    const polling = usePolling<Snapshot>({
        interval: POLL_INTERVALS.customerProject,
        initialData: initial,
        key: projectId,
        fetch: async (signal) => {
            const res = await fetch(`/api/projects/${projectId}`, { cache: 'no-store', signal, headers: { Accept: 'application/json' }, credentials: 'same-origin' });
            if (!res.ok) throw new Error('snapshot');
            return ((await res.json()) as { snapshot: Snapshot }).snapshot;
        },
        announce: (prev, next) => (prev && prev.status !== next.status ? `${bannerCopy(next.status).title}` : null),
    });
    const snap = polling.data ?? initial;
    const brand = snap.latestBrief?.answers?.brandName?.trim() || 'Your project';
    const hrefs = { overview: base, concepts: `${base}/concepts`, messages: `${base}/messages`, brief: `${base}/brief`, files: `${base}/files` } satisfies Record<CustomerSection, string>;
    const copy = bannerCopy(snap.status);
    const target = PRIMARY_HREF[snap.status];
    const revisions = snap.entitlementUsage.revisions;
    const standing = { remaining: revisions.remaining ?? 0, reserved: revisions.reserved ?? 0 };
    const activity = [...(snap.messages ?? [])].filter((m) => m.kind === 'system').slice(-5).reverse();
    const userMenu = {
        user,
        accountHref: '/account',
        invoicesHref: '/invoices',
        onSignOut: () => void logoutAndVerifySession().then(() => router.visit('/login')).catch(() => undefined),
    };

    return (
        <CustomerShell homeHref="/dashboard" userMenu={userMenu} breadcrumbs={[{ label: 'Projects', href: '/dashboard' }, { label: brand }]} project={{ current: 'overview', hrefs }}>
            <Head title={`${brand}: Overview`} />
            <h1 className="text-2xl font-semibold text-fg">{brand}</h1>
            <PurchaseBanner search={typeof window === 'undefined' ? '' : window.location.search} onConfirmed={polling.refresh} />
            <TurnBanner
                state={snap.status}
                action={
                    target ? (
                        <InertiaLink
                            href={`${base}/${target}`}
                            data-variant="primary"
                            className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-transparent bg-accent px-5 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-text sm:w-auto"
                        >
                            {copy.actionLabel}
                        </InertiaLink>
                    ) : undefined
                }
            />
            <PollingStatus reconnecting={polling.reconnecting} announcement={polling.announcement} refresh={polling.refresh} />
            <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <div className="flex min-w-0 flex-col gap-6">
                    {inUpsellPhase(snap.status) ? <UpsellPanel projectId={projectId} packageCode={snap.packageCode} revisions={standing} /> : null}
                    <Panel title="Recent activity">
                        {activity.length === 0 ? (
                            <p className="text-base text-fg-2">Nothing yet. Updates appear here as your project moves on.</p>
                        ) : (
                            <ul className="flex flex-col gap-2">
                                {activity.map((m) => (
                                    <li key={m.id} className="text-base text-fg-2">
                                        {m.body}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Panel>
                    <Panel title="Shortcuts">
                        <ul className="flex flex-col gap-2">
                            <li>
                                <Link href={hrefs.brief} variant="standalone">
                                    <FileText aria-hidden="true" size={16} strokeWidth={1.5} />
                                    Your brief
                                </Link>
                            </li>
                            <li>
                                <Link href={hrefs.files} variant="standalone">
                                    <Folder aria-hidden="true" size={16} strokeWidth={1.5} />
                                    Files and invoices
                                </Link>
                            </li>
                        </ul>
                    </Panel>
                </div>
                <div className="order-first flex min-w-0 flex-col gap-6 lg:order-none">
                    <Panel title="Progress">
                        <StageTracker timeline={snap.timeline} label="Project progress" />
                    </Panel>
                    <Panel title="Concepts">
                        <AllowanceMeter label="Concepts" as="h3" noun={{ one: 'concept', many: 'concepts' }} usage={snap.entitlementUsage.concepts} />
                    </Panel>
                    <Panel title="Revisions">
                        <AllowanceMeter label="Revisions" as="h3" noun={{ one: 'revision', many: 'revisions' }} usage={revisions} />
                    </Panel>
                </div>
            </div>
        </CustomerShell>
    );
}

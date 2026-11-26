import { Head, router } from '@inertiajs/react';
import { useCallback, useEffect, useState } from 'react';

import { ConceptViewer, type ConceptVersion } from '@/Components/ui/ConceptViewer';
import { InlineAlert } from '@/Components/ui/InlineAlert';
import { Button } from '@/Components/ui/Button';
import { Skeleton } from '@/Components/ui/Skeleton';
import { CustomerShell, type CustomerSection } from '@/Layouts/CustomerShell';
import { logoutAndVerifySession } from '@/lib/auth';
import { apiError, cardStatus, versionsOf, type ApiAsset } from '@/lib/concepts';

/**
 * Story 6.7 UI half (C-09; UX §11, §14): the concept detail, the image with its version history (newest first,
 * switchable, zoomable). The feedback composer and revision request are story 6.8 and Approve is 6.9: not here yet.
 */
type Props = {
    projectId: string;
    concept: { id: string; number: number; status: string; notes: string | null };
    snapshot: { hasNewConcepts?: boolean; hasNewMessages?: boolean; latestBrief?: { answers?: { brandName?: string } } | null };
    user: { name: string; email: string };
};

export default function Concept({ projectId, concept, snapshot, user }: Props) {
    const base = `/project/${projectId}`;
    const [versions, setVersions] = useState<ConceptVersion[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const res = await fetch(`/api/projects/${projectId}/concepts/${concept.id}/assets`, { cache: 'no-store', headers: { Accept: 'application/json' }, credentials: 'same-origin' });
            const payload = (await res.json().catch(() => null)) as { assets?: ApiAsset[] } | null;
            if (!res.ok) throw new Error(apiError(payload, 'Please try again.'));
            setVersions(versionsOf(payload?.assets ?? []));
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Please try again.');
        }
    }, [projectId, concept.id]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- loads from an external system; state is set after the await
        void load();
    }, [load]);

    const brand = snapshot.latestBrief?.answers?.brandName?.trim() || 'Your project';
    const hrefs = { overview: base, concepts: `${base}/concepts`, messages: `${base}/messages`, brief: `${base}/brief`, files: `${base}/files` } satisfies Record<CustomerSection, string>;
    const userMenu = {
        user,
        accountHref: '/account',
        invoicesHref: '/invoices',
        onSignOut: () => void logoutAndVerifySession().then(() => router.visit('/login')).catch(() => undefined),
    };

    return (
        <CustomerShell
            homeHref="/dashboard"
            userMenu={userMenu}
            breadcrumbs={[{ label: 'Projects', href: '/dashboard' }, { label: brand, href: base }, { label: 'Concepts', href: hrefs.concepts }, { label: `Concept ${concept.number}` }]}
            project={{ current: 'concepts', hrefs, isNew: { concepts: Boolean(snapshot.hasNewConcepts), messages: Boolean(snapshot.hasNewMessages) } }}
        >
            <Head title={`${brand}: Concept ${concept.number}`} />
            <h1 className="sr-only">
                Concept {concept.number}
            </h1>
            {error ? (
                <InlineAlert tone="danger" title="We couldn’t load this concept" action={<Button size="sm" onClick={() => void load()}>Try again</Button>}>
                    {error}
                </InlineAlert>
            ) : versions === null ? (
                <Skeleton variant="card" what="concept" count={1} />
            ) : (
                <ConceptViewer number={concept.number} versions={versions} status={cardStatus(concept.status)} headingLevel={2} />
            )}
            {concept.notes?.trim() ? <p className="whitespace-pre-line text-base text-fg-2">{concept.notes.trim()}</p> : null}
        </CustomerShell>
    );
}

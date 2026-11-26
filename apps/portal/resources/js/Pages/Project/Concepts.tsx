import { Head, router } from '@inertiajs/react';
import { useCallback, useEffect, useState } from 'react';

import { ConceptGallery } from '@/Components/ui/ConceptCard';
import { CustomerShell, type CustomerSection } from '@/Layouts/CustomerShell';
import { logoutAndVerifySession } from '@/lib/auth';
import { apiError, cardStatus, newestFirst, signed, type ApiConcept } from '@/lib/concepts';

/**
 * Story 6.7 UI half (C-08; UX §14): the concepts gallery. Big images, the concept number and version, newest first.
 * Opening it marks concepts as seen (read-state, K-14's "new" rule as in Next), which clears the tab dot.
 * Images are the API's signed URLs. Feedback and approval live on the concept detail (stories 6.8, 6.9).
 */
type Props = {
    projectId: string;
    snapshot: { hasNewConcepts?: boolean; hasNewMessages?: boolean; latestBrief?: { answers?: { brandName?: string } } | null };
    user: { name: string; email: string };
};

export default function Concepts({ projectId, snapshot, user }: Props) {
    const base = `/project/${projectId}`;
    const [concepts, setConcepts] = useState<ApiConcept[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [seen, setSeen] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await fetch(`/api/projects/${projectId}/concepts`, { cache: 'no-store', headers: { Accept: 'application/json' }, credentials: 'same-origin' });
            const payload = (await res.json().catch(() => null)) as { concepts?: ApiConcept[] } | null;
            if (!res.ok) throw new Error(apiError(payload, 'Please try again.'));
            setConcepts(newestFirst(payload?.concepts ?? []));
            setError(null);
            const read = await fetch(`/api/projects/${projectId}/read-state`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ area: 'concepts' }),
                credentials: 'same-origin',
            }).catch(() => null);
            if (read?.ok) setSeen(true);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Please try again.');
        } finally {
            setLoading(false);
        }
    }, [projectId]);

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
            breadcrumbs={[{ label: 'Projects', href: '/dashboard' }, { label: brand, href: base }, { label: 'Concepts' }]}
            project={{ current: 'concepts', hrefs, isNew: { concepts: Boolean(snapshot.hasNewConcepts) && !seen, messages: Boolean(snapshot.hasNewMessages) } }}
        >
            <Head title={`${brand}: Concepts`} />
            <h1 className="text-2xl font-semibold text-fg">Concepts</h1>
            <ConceptGallery
                label="Concepts"
                loading={loading}
                error={error}
                onRetry={() => {
                    setLoading(true);
                    void load();
                }}
                concepts={concepts.map((c) => ({
                    id: c.id,
                    number: c.number,
                    version: c.revisionVersion,
                    image: signed(c.imageUrl, c.imageKey),
                    href: `${base}/concept/${c.id}`,
                    status: cardStatus(c.status),
                }))}
            />
        </CustomerShell>
    );
}

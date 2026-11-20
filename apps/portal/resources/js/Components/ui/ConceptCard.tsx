import { Archive, CircleCheck } from 'lucide-react';
import { useId, type ReactNode } from 'react';

import { Button } from '@/Components/ui/Button';
import { Card, CardLink, LoadingBlock } from '@/Components/ui/Card';
import { InlineAlert } from '@/Components/ui/InlineAlert';
import { PrivateImage } from '@/Components/ui/PrivateImage';
import type { SignedImage } from '@/lib/media';
import { cx } from '@/lib/ui';

/**
 * UX §11 Concept card (story 1.8c): thumbnail (stable private image, fixed 4:3 box), "Concept n",
 * "Version v", the status as icon + text (approved / archived, never colour alone), an optional
 * "New" label and a note (e.g. the admin's pending-request count). The title is the card's one
 * link, stretched over it. ConceptGallery adds the list states (loading, error, empty).
 */
export type ConceptStatus = 'approved' | 'archived' | null;

export type ConceptCardProps = {
    number: number;
    version: number;
    image: SignedImage | null;
    href: string;
    status?: ConceptStatus;
    isNew?: boolean;
    /** E.g. "2 revision requests" (admin). */
    note?: ReactNode;
    selected?: boolean;
};

export function conceptAlt(number: number, version: number): string {
    return `Concept ${number}, version ${version}`;
}

export function ConceptCard({ number, version, image, href, status = null, isNew = false, note, selected = false }: ConceptCardProps) {
    const metaId = useId();
    return (
        <Card as="article" variant={selected ? 'selected' : 'interactive'} padding="none" aria-current={selected || undefined}>
            <PrivateImage image={image} alt={conceptAlt(number, version)} className={cx('border-b border-divider', status === 'archived' && 'opacity-60')} />
            <div className="flex flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-semibold">
                        <CardLink href={href} aria-describedby={metaId}>
                            Concept {number}
                        </CardLink>
                    </h3>
                    {isNew ? <span className="rounded-sm bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent-text">New</span> : null}
                </div>
                <p id={metaId} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-2">
                    <span>Version {version}</span>
                    {status ? <ConceptStatusLabel status={status} /> : null}
                    {note ? <span className="text-fg-2">{note}</span> : null}
                </p>
            </div>
        </Card>
    );
}

export function ConceptStatusLabel({ status }: { status: Exclude<ConceptStatus, null> }) {
    return status === 'approved' ? (
        <span className="inline-flex items-center gap-1 font-medium text-success">
            <CircleCheck aria-hidden="true" size={16} strokeWidth={1.5} />
            Approved
        </span>
    ) : (
        <span className="inline-flex items-center gap-1 text-fg-2">
            <Archive aria-hidden="true" size={16} strokeWidth={1.5} />
            Archived
        </span>
    );
}

type GalleryProps = {
    /** The list's accessible name, e.g. "Concepts". */
    label: string;
    concepts: readonly (ConceptCardProps & { id: string })[];
    loading?: boolean;
    /** Plain-language error; the cards already shown (if any) stay. */
    error?: string | null;
    onRetry?: () => void;
    /** What appears when there are none yet (1.8b's EmptyState goes here). */
    empty?: ReactNode;
};

/** The concepts grid with every list state (UX §12): loading, error, empty, partial (a card's preview unavailable). */
export function ConceptGallery({ label, concepts, loading = false, error, onRetry, empty }: GalleryProps) {
    if (loading && concepts.length === 0) {
        return (
            <div aria-busy="true" className="flex flex-col gap-3">
                <span className="sr-only">Loading {label.toLowerCase()}</span>
                <ul aria-hidden="true" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {[0, 1, 2].map((i) => (
                        <li key={i} className="flex flex-col overflow-hidden rounded-md border border-divider bg-surface">
                            <LoadingBlock className="aspect-4/3 rounded-none" />
                            <div className="flex flex-col gap-2 p-4">
                                <LoadingBlock className="h-5 w-24" />
                                <LoadingBlock className="h-4 w-16" />
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
        );
    }
    return (
        <div className="flex flex-col gap-4">
            {error ? (
                <InlineAlert tone="danger" title="We couldn’t load the concepts" action={onRetry ? <Button size="sm" onClick={onRetry}>Try again</Button> : undefined}>
                    {error}
                </InlineAlert>
            ) : null}
            {concepts.length === 0 && !error ? (
                (empty ?? <p className="text-base text-fg-2">No concepts yet.</p>)
            ) : (
                <ul aria-label={label} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {concepts.map(({ id, ...concept }) => (
                        <li key={id} className="flex">
                            <div className="flex w-full flex-col [&>article]:h-full">
                                <ConceptCard {...concept} />
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

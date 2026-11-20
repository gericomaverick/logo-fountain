import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Maximize2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { Button } from '@/Components/ui/Button';
import { ChoiceChips } from '@/Components/ui/ChoiceChips';
import { conceptAlt, ConceptStatusLabel, type ConceptStatus } from '@/Components/ui/ConceptCard';
import { CloseButton, overlayClass, useOverlayBehaviour } from '@/Components/ui/Dialog';
import { PrivateImage } from '@/Components/ui/PrivateImage';
import { formatDate, type SignedImage } from '@/lib/media';
import { cx } from '@/lib/ui';

/**
 * UX §11 Concept viewer (story 1.8c): the full view with a version switcher and zoom.
 * - The image box has a fixed 4:3 ratio (no layout shift between versions) and the stable
 *   private-image rule (ADR-021).
 * - Versions are single-choice chips (native radios: one tab stop, arrow keys switch version);
 *   "Version 2 · 18 Nov 2026" in the label so the date is read with it. Newest first.
 * - "Zoom" opens a full-screen Radix dialog (focus trapped, Esc closes, focus returns to Zoom)
 *   with an "Actual size" toggle (aria-pressed; off = fitted to the screen); at actual size the image scrolls (keyboard too: the
 *   scroll area is focusable).
 * Controlled (`version` + `onVersionChange`) or not (starts on the newest).
 */
export type ConceptVersion = { version: number; image: SignedImage | null; createdAt: string };

type Props = {
    number: number;
    versions: readonly ConceptVersion[];
    version?: number;
    onVersionChange?: (version: number) => void;
    status?: ConceptStatus;
    /** Actions under the image (e.g. Approve), so the viewer stays presentational. */
    children?: ReactNode;
    /** 2 on the concept detail screen; 3 inside a section that has its own h2. */
    headingLevel?: 2 | 3;
};

export function ConceptViewer({ number, versions, version, onVersionChange, status = null, children, headingLevel = 2 }: Props) {
    const Heading = headingLevel === 2 ? 'h2' : 'h3';
    const ordered = [...versions].sort((a, b) => b.version - a.version);
    const [own, setOwn] = useState(ordered[0]?.version ?? 1);
    const current = version ?? own;
    const shown = ordered.find((v) => v.version === current) ?? ordered[0];
    const select = (next: number) => {
        if (version === undefined) setOwn(next);
        onVersionChange?.(next);
    };

    if (!shown) {
        return <p className="text-base text-fg-2">This concept has no versions yet.</p>;
    }
    const alt = conceptAlt(number, shown.version);

    return (
        <section aria-label={`Concept ${number}`} className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Heading className="text-xl font-semibold text-fg">Concept {number}</Heading>
                    {status ? (
                        <span className="text-sm">
                            <ConceptStatusLabel status={status} />
                        </span>
                    ) : null}
                </div>
                <ZoomDialog image={shown.image} alt={alt} />
            </div>
            <div className="overflow-hidden rounded-lg border border-divider">
                <PrivateImage image={shown.image} alt={alt} />
            </div>
            {ordered.length > 1 ? (
                <ChoiceChips
                    legend="Version"
                    size="sm"
                    options={ordered.map((v) => ({ value: String(v.version), label: `Version ${v.version} · ${formatDate(v.createdAt)}` }))}
                    value={String(shown.version)}
                    onChange={(v) => select(Number(v))}
                />
            ) : (
                <p className="text-sm text-fg-2">
                    Version {shown.version} · {formatDate(shown.createdAt)}
                </p>
            )}
            {children}
        </section>
    );
}

function ZoomDialog({ image, alt }: { image: SignedImage | null; alt: string }) {
    const [actual, setActual] = useState(false);
    const behaviour = useOverlayBehaviour(false, (open) => {
        if (!open) setActual(false);
    });
    if (!image) return null; // nothing to zoom: the box already says "Preview unavailable"
    return (
        <DialogPrimitive.Root {...behaviour.root}>
            <DialogPrimitive.Trigger asChild>
                <Button size="sm" variant="secondary" icon={<Maximize2 aria-hidden size={16} strokeWidth={1.5} />}>
                    Zoom
                </Button>
            </DialogPrimitive.Trigger>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className={overlayClass} />
                <DialogPrimitive.Content
                    {...behaviour.content}
                    aria-describedby={undefined}
                    className="fixed inset-2 z-50 flex flex-col gap-3 rounded-lg border border-divider bg-surface p-3 shadow-overlay animate-fade-in md:inset-6 md:p-4"
                >
                    <div className="flex items-center justify-between gap-3">
                        <DialogPrimitive.Title className="text-lg font-semibold text-fg">{alt}</DialogPrimitive.Title>
                        <div className="flex items-center gap-2">
                            <Button size="sm" variant="secondary" aria-pressed={actual} onClick={() => setActual((a) => !a)}>
                                Actual size
                            </Button>
                            <CloseButton busy={false} />
                        </div>
                    </div>
                    {/* A scrollable region must be focusable so keyboard users can scroll it (axe scrollable-region-focusable, WCAG 2.1.1). */}
                    <div
                        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- see above
                        tabIndex={0}
                        role="region"
                        aria-label={`${alt}, ${actual ? 'actual size' : 'fitted to screen'}`}
                        className={cx('relative min-h-0 flex-1 rounded-md bg-sunken', actual ? 'overflow-auto' : 'overflow-hidden')}
                    >
                        <img
                            src={image.url}
                            alt={alt}
                            draggable={false}
                            className={actual ? 'max-w-none' : 'absolute inset-0 size-full object-contain p-4'}
                        />
                    </div>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    );
}

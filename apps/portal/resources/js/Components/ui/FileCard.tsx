import { Download, FileArchive, FileText, Receipt } from 'lucide-react';
import { useId, type ReactNode } from 'react';

import { Button } from '@/Components/ui/Button';
import { Card } from '@/Components/ui/Card';
import { InlineAlert } from '@/Components/ui/InlineAlert';
import { Skeleton } from '@/Components/ui/Skeleton';
import { formatBytes, formatDate } from '@/lib/media';

/**
 * UX §11 File card (story 1.8c): final ZIP · invoice · receipt. The name in mono, size and date,
 * and one download button (primary for the final ZIP, UX §14 Files: "Download ZIP"; secondary for
 * documents, since a list of invoices can't all be primary).
 * States: ready · downloading (keeps a label) · not available yet (the button says why) ·
 * error (an inline alert, the button stays to retry) · loading (placeholder).
 * Presentational: `onDownload` fetches the signed URL (Epics 6–7).
 */
export type FileKind = 'final' | 'invoice' | 'receipt';

type Props = {
    kind: FileKind;
    name: string;
    sizeBytes?: number | null;
    /** ISO date it was made available. */
    date: string;
    /** E.g. "£95 · Paid" for invoices. */
    detail?: ReactNode;
    onDownload?: () => void;
    downloading?: boolean;
    /** The download isn't possible yet, and why (shown under the button). */
    unavailableReason?: string | null;
    /** A plain-language download error. */
    error?: string | null;
    /** Force the button's variant (defaults: primary for final, secondary otherwise). */
    primary?: boolean;
};

const KIND = {
    final: { Icon: FileArchive, label: 'Download ZIP', type: 'ZIP' },
    invoice: { Icon: FileText, label: 'Download invoice', type: 'Invoice' },
    receipt: { Icon: Receipt, label: 'Download receipt', type: 'Receipt' },
} as const;

export function FileCard({ kind, name, sizeBytes, date, detail, onDownload, downloading = false, unavailableReason, error, primary }: Props) {
    const nameId = useId();
    const k = KIND[kind];
    const meta = [k.type, sizeBytes ? formatBytes(sizeBytes) : null, formatDate(date)].filter(Boolean).join(' · ');
    return (
        <Card as="article" aria-labelledby={nameId}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                    <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-sunken text-fg-2">
                        <k.Icon aria-hidden="true" size={20} strokeWidth={1.5} />
                    </span>
                    <div className="flex min-w-0 flex-col gap-1">
                        <h3 id={nameId} className="font-mono text-sm font-medium break-all text-fg">
                            {name}
                        </h3>
                        <p className="text-sm text-fg-2">{meta}</p>
                        {detail ? <p className="text-sm text-fg-2">{detail}</p> : null}
                    </div>
                </div>
                <div className="shrink-0">
                    <Button
                        variant={(primary ?? kind === 'final') ? 'primary' : 'secondary'}
                        icon={<Download aria-hidden size={16} strokeWidth={1.5} />}
                        loading={downloading}
                        loadingLabel="Preparing download…"
                        disabledReason={unavailableReason}
                        onClick={onDownload}
                        width="phone"
                        aria-describedby={nameId}
                    >
                        {k.label}
                    </Button>
                </div>
            </div>
            {error ? (
                <InlineAlert tone="danger" announce>
                    {error}
                </InlineAlert>
            ) : null}
        </Card>
    );
}

/** A file card's first-load placeholder: a one-row list Skeleton ("Loading files…") in the card's shape (story 1.9). */
export function FileCardPlaceholder({ what = 'files' }: { what?: string }) {
    return (
        <div className="rounded-md border border-divider bg-surface px-4 md:px-5">
            <Skeleton variant="list" what={what} count={1} />
        </div>
    );
}

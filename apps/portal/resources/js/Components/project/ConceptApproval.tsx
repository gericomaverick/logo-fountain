import { router } from '@inertiajs/react';
import { useRef, useState } from 'react';

import { Button } from '@/Components/ui/Button';
import { ConfirmDialog } from '@/Components/ui/ConfirmDialog';
import { InlineAlert } from '@/Components/ui/InlineAlert';
import { Link } from '@/Components/ui/Link';
import { APPROVAL_COPY, approvalError, canApprove } from '@/lib/concepts';

/**
 * Story 6.9 UI half (C-12; UX §3, §12 level 3, §14): "Approve this concept" opens a confirmation (what approval
 * means + acknowledgement). Shown as Next does: the button only on a published concept while the project is
 * CONCEPTS_READY; an approved concept shows the final-files state (it comes from the concept's status, so it
 * survives the reload). Nothing for archived concepts.
 */
type Props = { projectId: string; conceptId: string; conceptStatus: string; projectStatus: string; overviewHref: string };

export function ConceptApproval({ projectId, conceptId, conceptStatus, projectStatus, overviewHref }: Props) {
    const [open, setOpen] = useState(false);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const sending = useRef(false);

    if (conceptStatus === 'approved') {
        return (
            <InlineAlert tone="success" title="This concept is approved">
                Your designer is preparing your final files. We’ll email you when they’re ready to download.{' '}
                <Link href={overviewHref}>See your project overview</Link>
            </InlineAlert>
        );
    }
    if (!canApprove(conceptStatus, projectStatus)) return null;

    const approve = async () => {
        if (sending.current) return;
        sending.current = true;
        setPending(true);
        setError(null);
        try {
            const res = await fetch(`/api/projects/${projectId}/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ conceptId }),
            });
            const payload = (await res.json().catch(() => null)) as unknown;
            if (!res.ok) {
                setError(approvalError(payload));
            } else {
                setOpen(false);
                // Concept, project status and the other concepts all changed: reload the page props.
                router.reload();
            }
        } catch {
            setError('We couldn’t reach the server. Nothing was approved: please try again.');
        } finally {
            sending.current = false;
            setPending(false);
        }
    };

    return (
        <div className="flex flex-col gap-3">
            <Button
                variant="primary"
                width="phone"
                onClick={() => {
                    setError(null);
                    setOpen(true);
                }}
            >
                Approve this concept
            </Button>
            <ConfirmDialog
                open={open}
                onOpenChange={setOpen}
                title={APPROVAL_COPY.title}
                description={APPROVAL_COPY.body}
                acknowledgement={APPROVAL_COPY.acknowledgement}
                confirmLabel={APPROVAL_COPY.confirm}
                pendingLabel="Approving…"
                cancelLabel={APPROVAL_COPY.cancel}
                pending={pending}
                error={error}
                onConfirm={() => void approve()}
            />
        </div>
    );
}

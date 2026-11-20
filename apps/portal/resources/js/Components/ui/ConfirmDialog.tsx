import { useEffect, useState, type ReactElement, type ReactNode } from 'react';

import { Button } from '@/Components/ui/Button';
import { Checkbox } from '@/Components/ui/Checkbox';
import { Dialog } from '@/Components/ui/Dialog';
import { Field } from '@/Components/ui/Field';
import { InlineAlert } from '@/Components/ui/InlineAlert';
import { Input } from '@/Components/ui/Input';
import { confirmBlocker } from '@/lib/ui';

/**
 * UX §11 Confirm dialog, for §12 confirmation levels 3 and 4:
 * - level 3 (commits the project: brief submission, approval): `acknowledgement` checkbox;
 * - level 4 (destructive admin action): tone="danger", the effects as children, and
 *   `confirmPhrase` for type-to-confirm (clean-slate reset).
 * The confirm button says why it can't be pressed yet. The caller owns the request: it sets
 * `pending` while it runs (the dialog then can't be closed, §11) and `error` (plain language,
 * from lib/errors) if it fails; the dialog stays open with the typed input kept (§12).
 */
type Props = {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    trigger?: ReactElement;
    title: ReactNode;
    description?: ReactNode;
    /** What happens, e.g. a list of effects. */
    children?: ReactNode;
    tone?: 'default' | 'danger';
    /** Verb-first, naming the outcome (§12): "Approve this concept", "Reset project". */
    confirmLabel: string;
    /** Shown while pending, e.g. "Approving…". */
    pendingLabel: string;
    cancelLabel?: string;
    acknowledgement?: string;
    confirmPhrase?: string;
    pending?: boolean;
    error?: string | null | undefined;
    onConfirm: () => void;
};

export function ConfirmDialog({
    open,
    onOpenChange,
    trigger,
    title,
    description,
    children,
    tone = 'default',
    confirmLabel,
    pendingLabel,
    cancelLabel = 'Cancel',
    acknowledgement,
    confirmPhrase,
    pending = false,
    error,
    onConfirm,
}: Props) {
    const [acknowledged, setAcknowledged] = useState(false);
    const [typed, setTyped] = useState('');
    const blocker = confirmBlocker({ acknowledgement, acknowledged, confirmPhrase, typed });

    // A fresh start every time it opens.
    useEffect(() => {
        if (open === false) {
            setAcknowledged(false);
            setTyped('');
        }
    }, [open]);

    const handleOpenChange = (next: boolean) => {
        if (!next) {
            setAcknowledged(false);
            setTyped('');
        }
        onOpenChange?.(next);
    };

    return (
        <Dialog
            {...(open === undefined ? {} : { open })}
            onOpenChange={handleOpenChange}
            {...(trigger ? { trigger } : {})}
            title={title}
            description={description}
            tone={tone}
            busy={pending}
            footer={
                <>
                    <CancelButton label={cancelLabel} pending={pending} onCancel={() => handleOpenChange(false)} />
                    <Button
                        variant={tone === 'danger' ? 'danger' : 'primary'}
                        width="phone"
                        loading={pending}
                        loadingLabel={pendingLabel}
                        disabledReason={pending ? null : blocker}
                        onClick={onConfirm}
                    >
                        {confirmLabel}
                    </Button>
                </>
            }
        >
            {children}
            {acknowledgement ? <Checkbox label={acknowledgement} checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} disabled={pending} /> : null}
            {confirmPhrase ? (
                <Field label={`Type ${confirmPhrase} to confirm`}>
                    <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} readOnly={pending} />
                </Field>
            ) : null}
            {error ? (
                <InlineAlert tone="danger" announce>
                    {error}
                </InlineAlert>
            ) : null}
        </Dialog>
    );
}

function CancelButton({ label, pending, onCancel }: { label: string; pending: boolean; onCancel: () => void }) {
    // Not disabled-with-reason while pending: the confirm button already says what's happening.
    return (
        <Button
            variant="secondary"
            width="phone"
            aria-disabled={pending || undefined}
            onClick={() => {
                if (!pending) onCancel();
            }}
        >
            {label}
        </Button>
    );
}

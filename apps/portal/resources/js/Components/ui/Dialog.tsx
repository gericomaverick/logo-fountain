import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useRef, type ReactElement, type ReactNode } from 'react';

import { cx } from '@/lib/ui';

/**
 * UX §11 Dialog★ (Radix Dialog, ADR-022): default · danger. Focus is trapped, Esc and an outside
 * press close it (except while `busy`, i.e. submitting), and focus returns to whatever opened it
 * (the `trigger`, or the element focused when it opened, for dialogs opened from code).
 * Footer actions: primary on the right on desktop, full width with the primary at the bottom on
 * phones (§12); pass them in reading order [secondary, primary] with Button width="phone".
 */
type DialogBaseProps = {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    /** The element that opens it (rendered via Radix Trigger asChild, e.g. a Button). */
    trigger?: ReactElement;
    title: ReactNode;
    description?: ReactNode;
    /** While true: Esc, outside presses and the close button don't close it (§11). */
    busy?: boolean;
    children?: ReactNode;
};

type DialogProps = DialogBaseProps & {
    footer?: ReactNode;
    tone?: 'default' | 'danger';
};

/** Shared by Dialog and Sheet: block closing while busy, and return focus on close. */
export function useOverlayBehaviour(busy: boolean, onOpenChange?: (open: boolean) => void) {
    const returnTo = useRef<HTMLElement | null>(null);
    const block = (event: Event) => {
        if (busy) event.preventDefault();
    };
    return {
        root: {
            onOpenChange: (next: boolean) => {
                if (!next && busy) return;
                onOpenChange?.(next);
            },
        },
        content: {
            onOpenAutoFocus: () => {
                // Still the opener at this point; Radix moves focus inside right after.
                const active = document.activeElement;
                returnTo.current = active instanceof HTMLElement && active !== document.body ? active : null;
            },
            onCloseAutoFocus: (event: Event) => {
                // Radix only restores focus to its own Trigger; also cover dialogs opened from code.
                const target = returnTo.current;
                if (target && target.isConnected) {
                    event.preventDefault();
                    target.focus();
                }
            },
            onEscapeKeyDown: block,
            onPointerDownOutside: block,
            onInteractOutside: block,
        },
    };
}

export const overlayClass = 'fixed inset-0 z-50 bg-fg/40 animate-fade-in dark:bg-sunken/80';

export function CloseButton({ busy, className }: { busy: boolean; className?: string }) {
    return (
        <DialogPrimitive.Close
            aria-label="Close"
            aria-disabled={busy || undefined}
            onClick={(e) => {
                if (busy) e.preventDefault();
            }}
            className={cx(
                'inline-flex size-11 items-center justify-center rounded-md text-fg-2 transition-colors hover:bg-sunken hover:text-fg aria-disabled:cursor-not-allowed aria-disabled:text-fg-3',
                className,
            )}
        >
            <X aria-hidden="true" size={20} strokeWidth={1.5} />
        </DialogPrimitive.Close>
    );
}

export function Dialog({ open, onOpenChange, trigger, title, description, busy = false, footer, tone = 'default', children }: DialogProps) {
    const behaviour = useOverlayBehaviour(busy, onOpenChange);

    return (
        <DialogPrimitive.Root {...(open === undefined ? {} : { open })} {...behaviour.root}>
            {trigger ? <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger> : null}
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className={overlayClass} />
                <DialogPrimitive.Content
                    {...behaviour.content}
                    {...(description ? {} : { 'aria-describedby': undefined })}
                    aria-busy={busy || undefined}
                    data-tone={tone}
                    className={cx(
                        'fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-6 overflow-y-auto rounded-lg border bg-surface p-6 shadow-overlay animate-fade-in',
                        tone === 'danger' ? 'border-danger' : 'border-divider',
                    )}
                >
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex flex-col gap-2">
                            <DialogPrimitive.Title className="text-lg font-semibold text-fg">{title}</DialogPrimitive.Title>
                            {description ? <DialogPrimitive.Description className="text-base text-fg-2">{description}</DialogPrimitive.Description> : null}
                        </div>
                        <CloseButton busy={busy} className="-mt-2 -mr-2 shrink-0" />
                    </div>
                    {children ? <div className="flex flex-col gap-4 text-base text-fg">{children}</div> : null}
                    {footer ? <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-end">{footer}</div> : null}
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    );
}

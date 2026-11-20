import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { ReactElement, ReactNode } from 'react';

import { CloseButton, overlayClass, useOverlayBehaviour } from '@/Components/ui/Dialog';
import { cx } from '@/lib/ui';

/**
 * UX §11 Sheet★ (phone): a bottom sheet for actions and menus. ADR-022: a Radix Dialog variant,
 * so it traps and restores focus like Dialog; it slides up (250 ms, off with reduced motion, §8.3)
 * and respects the home-indicator safe area. Put full-width Buttons (width="full") in it.
 */
type Props = {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    trigger?: ReactElement;
    title: ReactNode;
    /** Hide the title visually (it still names the sheet), e.g. for an action list. */
    hideTitle?: boolean;
    description?: ReactNode;
    busy?: boolean;
    children: ReactNode;
};

export function Sheet({ open, onOpenChange, trigger, title, hideTitle = false, description, busy = false, children }: Props) {
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
                    className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col gap-4 overflow-y-auto rounded-t-lg border-t border-divider bg-surface px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-overlay animate-sheet-in"
                >
                    <div className="flex items-start justify-between gap-4">
                        <div className={cx('flex flex-col gap-1', hideTitle && 'sr-only')}>
                            <DialogPrimitive.Title className="text-lg font-semibold text-fg">{title}</DialogPrimitive.Title>
                            {description ? <DialogPrimitive.Description className="text-base text-fg-2">{description}</DialogPrimitive.Description> : null}
                        </div>
                        <CloseButton busy={busy} className="-mt-2 -mr-2 ml-auto shrink-0" />
                    </div>
                    <div className="flex flex-col gap-2">{children}</div>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    );
}

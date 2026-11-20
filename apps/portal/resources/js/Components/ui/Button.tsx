import { useId, type ComponentPropsWithRef, type MouseEvent, type ReactNode } from 'react';

import { cx, describedBy } from '@/lib/ui';

/**
 * UX §11 Button: primary · secondary · ghost · danger; sm / md; loading; disabled-with-reason.
 * - One primary per view (§5 Frontend rule). Verb-first labels that name the outcome (§12).
 * - md is 44 px tall; sm is 32 px with a pointer, 44 px on touch (§13 targets).
 * - Loading keeps a label (`loadingLabel`, e.g. "Sending…"), sets aria-busy and ignores presses,
 *   but stays focusable so focus isn't lost mid-action.
 * - There is no bare `disabled`: a disabled button always says why (§12), so `disabledReason`
 *   renders helper text under it, linked with aria-describedby. It stays focusable (aria-disabled)
 *   so keyboard and screen-reader users can reach the reason.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

type Props = Omit<ComponentPropsWithRef<'button'>, 'className' | 'disabled' | 'style'> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    loading?: boolean;
    /** The label while loading, e.g. "Sending…". Defaults to the normal label. */
    loadingLabel?: ReactNode;
    /** Disables the button and shows this reason under it. */
    disabledReason?: string | null | undefined;
    /** A leading Lucide icon (decorative; the label names the action). */
    icon?: ReactNode;
    /** `full` always; `phone` full width below `sm` (dialog and footer actions, §12). */
    width?: 'auto' | 'full' | 'phone';
};

const VARIANT: Record<ButtonVariant, string> = {
    primary: 'border-transparent bg-accent text-accent-fg hover:bg-accent-text',
    secondary: 'border-border bg-surface text-fg hover:bg-sunken',
    ghost: 'border-transparent bg-transparent text-fg-2 hover:bg-sunken hover:text-fg',
    danger: 'border-transparent bg-danger text-accent-fg hover:bg-danger/90',
};

const SIZE: Record<ButtonSize, string> = {
    sm: 'min-h-8 px-3 pointer-coarse:min-h-11',
    md: 'min-h-11 px-5',
};

const WIDTH = { auto: '', full: 'w-full', phone: 'w-full sm:w-auto' } as const;

export function Button({
    variant = 'secondary',
    size = 'md',
    loading = false,
    loadingLabel,
    disabledReason,
    icon,
    width = 'auto',
    type = 'button',
    children,
    onClick,
    'aria-describedby': ariaDescribedBy,
    ...rest
}: Props) {
    const reasonId = useId();
    const disabled = Boolean(disabledReason);
    const inert = disabled || loading;

    const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
        // aria-disabled doesn't stop clicks or form submission by itself.
        if (inert) {
            event.preventDefault();
            return;
        }
        onClick?.(event);
    };

    const button = (
        <button
            {...rest}
            type={type}
            onClick={handleClick}
            aria-disabled={inert || undefined}
            aria-busy={loading || undefined}
            aria-describedby={describedBy(ariaDescribedBy, disabled && reasonId)}
            data-variant={variant}
            className={cx(
                'inline-flex items-center justify-center gap-2 rounded-md border text-sm font-semibold transition-colors select-none',
                SIZE[size],
                WIDTH[width],
                disabled ? 'cursor-not-allowed border-divider bg-sunken text-fg-3' : VARIANT[variant],
                loading && 'cursor-progress',
            )}
        >
            {icon}
            {loading && loadingLabel ? loadingLabel : children}
        </button>
    );

    if (!disabled) return button;
    return (
        <span className={cx('inline-flex flex-col items-start gap-1', WIDTH[width])}>
            {button}
            <span id={reasonId} className="text-sm text-fg-3">
                {disabledReason}
            </span>
        </span>
    );
}

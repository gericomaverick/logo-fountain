import { Check } from 'lucide-react';
import { useId, type ComponentPropsWithRef, type ReactNode } from 'react';

import { FieldError } from '@/Components/ui/Field';
import { cx, describedBy } from '@/lib/ui';

/**
 * UX §11 Checkbox: default · focus · error · disabled · read-only. A native checkbox (so forms,
 * Space and screen readers just work) drawn with tokens; the whole label row is the 44 px target.
 * Used on its own, e.g. the acknowledgement in a Confirm dialog (§12 level 3).
 */
type Props = Omit<ComponentPropsWithRef<'input'>, 'type' | 'className' | 'style' | 'children'> & {
    label: ReactNode;
    hint?: ReactNode;
    error?: string | null | undefined;
};

export function Checkbox({ label, hint, error, readOnly = false, disabled, onClick, id, 'aria-describedby': extra, ...rest }: Props) {
    const generated = useId();
    const inputId = id ?? `checkbox${generated}`;
    const hintId = `${inputId}-hint`;
    const errorId = `${inputId}-error`;
    const invalid = Boolean(error);

    return (
        <div className="flex flex-col gap-1">
            <label
                htmlFor={inputId}
                className={cx(
                    'flex min-h-11 items-start gap-3 py-2.5 text-base',
                    disabled ? 'cursor-not-allowed text-fg-3' : readOnly ? 'text-fg' : 'cursor-pointer text-fg',
                )}
            >
                <span className="relative mt-0.5 inline-flex size-5 shrink-0">
                    <input
                        {...rest}
                        id={inputId}
                        type="checkbox"
                        disabled={disabled}
                        aria-readonly={readOnly || undefined}
                        aria-invalid={invalid || undefined}
                        aria-describedby={describedBy(extra, hint ? hintId : null, error ? errorId : null)}
                        onClick={(event) => {
                            if (readOnly) event.preventDefault();
                            else onClick?.(event);
                        }}
                        className={cx(
                            'peer size-5 appearance-none rounded-sm border bg-surface transition-colors checked:border-accent checked:bg-accent',
                            'disabled:border-divider disabled:bg-sunken disabled:checked:border-fg-3 disabled:checked:bg-fg-3',
                            readOnly && 'border-border bg-sunken checked:border-fg-2 checked:bg-fg-2',
                            !readOnly && (invalid ? 'border-danger' : 'border-border'),
                        )}
                    />
                    <Check
                        aria-hidden="true"
                        size={16}
                        strokeWidth={2}
                        className="pointer-events-none absolute inset-0 m-auto hidden text-accent-fg peer-checked:block"
                    />
                </span>
                <span>{label}</span>
            </label>
            {hint ? (
                <p id={hintId} className="pl-8 text-sm text-fg-3">
                    {hint}
                </p>
            ) : null}
            {error ? (
                <div className="pl-8">
                    <FieldError id={errorId}>{error}</FieldError>
                </div>
            ) : null}
        </div>
    );
}

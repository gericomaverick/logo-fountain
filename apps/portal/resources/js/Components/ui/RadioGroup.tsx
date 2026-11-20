import { useId, type ReactNode } from 'react';

import { FieldGroup } from '@/Components/ui/Field';
import { cx } from '@/lib/ui';

/**
 * UX §11 Radio group: default · focus · error · disabled · read-only. A fieldset + legend of native
 * radios sharing a name, so the browser gives the keyboard model: Tab enters at the checked
 * option, arrow keys move and select. Controlled: read-only simply ignores changes.
 */
export type RadioOption = { value: string; label: ReactNode; description?: ReactNode; disabled?: boolean };

type Props = {
    legend: ReactNode;
    hint?: ReactNode;
    error?: string | null | undefined;
    name?: string;
    options: readonly RadioOption[];
    value: string | null;
    onChange: (value: string) => void;
    disabled?: boolean;
    readOnly?: boolean;
};

export function RadioGroup({ legend, hint, error, name, options, value, onChange, disabled = false, readOnly = false }: Props) {
    const generated = useId();
    const groupName = name ?? `radio${generated}`;

    return (
        <FieldGroup legend={legend} hint={hint} error={error}>
            {(invalid) =>
                options.map((o) => {
                    const off = disabled || Boolean(o.disabled);
                    const descId = o.description ? `${groupName}-${o.value}-desc` : undefined;
                    return (
                        <label
                            key={o.value}
                            className={cx('flex min-h-11 items-start gap-3 py-2.5 text-base', off ? 'cursor-not-allowed text-fg-3' : readOnly ? 'text-fg' : 'cursor-pointer text-fg')}
                        >
                            <input
                                type="radio"
                                name={groupName}
                                value={o.value}
                                checked={value === o.value}
                                disabled={off}
                                aria-readonly={readOnly || undefined}
                                aria-invalid={invalid || undefined}
                                aria-describedby={descId}
                                onChange={() => {
                                    if (!readOnly) onChange(o.value);
                                }}
                                className={cx(
                                    'mt-0.5 size-5 shrink-0 appearance-none rounded-full border bg-surface transition-colors',
                                    'checked:border-accent checked:bg-accent checked:shadow-[inset_0_0_0_3px_var(--color-surface)]',
                                    'disabled:border-divider disabled:bg-sunken disabled:checked:border-fg-3 disabled:checked:bg-fg-3',
                                    readOnly && 'border-border bg-sunken checked:border-fg-2 checked:bg-fg-2',
                                    !readOnly && (invalid ? 'border-danger' : 'border-border'),
                                )}
                            />
                            <span className="flex flex-col">
                                <span>{o.label}</span>
                                {o.description ? (
                                    <span id={descId} className="text-sm text-fg-3">
                                        {o.description}
                                    </span>
                                ) : null}
                            </span>
                        </label>
                    );
                })
            }
        </FieldGroup>
    );
}

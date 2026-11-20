import { Check } from 'lucide-react';
import { useId, type ReactNode } from 'react';

import { FieldGroup } from '@/Components/ui/Field';
import { cx } from '@/lib/ui';

/**
 * UX §11 Choice chips: default · focus · error · disabled · read-only. Pick one (native radios,
 * arrow keys move the choice) or several (`multiple`: native checkboxes, Space toggles), drawn as
 * chips. The native input covers its chip, so pointer, keyboard and screen readers all use the
 * real control. Selection shows a tick as well as the colour (colour never alone, §8.1).
 */
export type ChipOption = { value: string; label: string; disabled?: boolean };

type Common = {
    legend: ReactNode;
    hideLegend?: boolean;
    hint?: ReactNode;
    error?: string | null | undefined;
    name?: string;
    options: readonly ChipOption[];
    disabled?: boolean;
    readOnly?: boolean;
    size?: 'sm' | 'md';
};

type Props = Common &
    ({ multiple?: false; value: string | null; onChange: (value: string) => void } | { multiple: true; value: readonly string[]; onChange: (value: string[]) => void });

export function ChoiceChips(props: Props) {
    const { legend, hideLegend, hint, error, name, options, disabled = false, readOnly = false, size = 'md' } = props;
    const generated = useId();
    const groupName = name ?? `chips${generated}`;
    const selected = (v: string) => (props.multiple ? props.value.includes(v) : props.value === v);

    const change = (v: string) => {
        if (readOnly) return;
        if (props.multiple) props.onChange(props.value.includes(v) ? props.value.filter((x) => x !== v) : [...props.value, v]);
        else props.onChange(v);
    };

    return (
        <FieldGroup legend={legend} hideLegend={hideLegend} hint={hint} error={error} layout="wrap">
            {(invalid) =>
                options.map((o) => {
                    const on = selected(o.value);
                    const off = disabled || Boolean(o.disabled);
                    return (
                        <label key={o.value} className="relative inline-flex">
                            <input
                                type={props.multiple ? 'checkbox' : 'radio'}
                                name={groupName}
                                value={o.value}
                                checked={on}
                                disabled={off}
                                aria-readonly={(props.multiple && readOnly) || undefined /* not allowed on radios */}
                                aria-invalid={invalid || undefined}
                                onChange={() => change(o.value)}
                                className={cx('peer absolute inset-0 size-full appearance-none rounded-md', off ? 'cursor-not-allowed' : readOnly ? 'cursor-default' : 'cursor-pointer')}
                            />
                            {/* Not aria-hidden: this text is the input's accessible name (via the label). */}
                            <span
                                className={cx(
                                    'inline-flex items-center gap-1 rounded-md border font-medium transition-colors',
                                    'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent',
                                    size === 'sm' ? 'min-h-8 px-3 text-sm pointer-coarse:min-h-11' : 'min-h-11 px-4 text-sm',
                                    off
                                        ? 'border-divider bg-sunken text-fg-3'
                                        : on
                                          ? cx('bg-accent-soft text-accent-text', readOnly ? 'border-divider' : 'border-accent')
                                          : cx('bg-surface text-fg', readOnly ? 'border-divider' : invalid ? 'border-danger' : 'border-border', !readOnly && 'peer-hover:bg-sunken'),
                                )}
                            >
                                {on ? <Check aria-hidden="true" size={16} strokeWidth={2} /> : null}
                                {o.label}
                            </span>
                        </label>
                    );
                })
            }
        </FieldGroup>
    );
}

import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';

import { controlClass, useFieldControl } from '@/Components/ui/Field';
import { cx } from '@/lib/ui';

/**
 * UX §11 Select★ (Radix Select, ADR-022): default · focus · error · disabled · read-only.
 * Inside a <Field>: the trigger (role combobox) takes the Field's id, so the label names it.
 * Radix gives the keyboard model (arrows, typeahead, Esc) and a hidden native select for forms.
 * Read-only shows the value, stays focusable, and never opens or changes.
 */
export type SelectOption = { value: string; label: string; disabled?: boolean };

type Props = {
    options: readonly SelectOption[];
    value?: string | undefined;
    defaultValue?: string;
    onValueChange?: (value: string) => void;
    placeholder?: string;
    name?: string;
    disabled?: boolean;
    readOnly?: boolean;
    required?: boolean;
    onBlur?: () => void;
};

export function Select({
    options,
    value,
    defaultValue,
    onValueChange,
    placeholder = 'Choose an option',
    name,
    disabled,
    readOnly = false,
    required,
    onBlur,
}: Props) {
    const { invalid, ...wiring } = useFieldControl();
    return (
        <SelectPrimitive.Root
            value={value}
            defaultValue={defaultValue}
            onValueChange={(next) => {
                if (!readOnly) onValueChange?.(next);
            }}
            {...(readOnly ? { open: false } : {})}
            name={name}
            disabled={disabled}
            required={required}
        >
            <SelectPrimitive.Trigger
                {...wiring}
                aria-readonly={readOnly || undefined}
                onBlur={onBlur}
                className={cx(
                    controlClass(invalid),
                    'flex items-center justify-between gap-2 text-left data-placeholder:text-fg-3',
                    readOnly && 'border-divider bg-sunken hover:border-divider',
                )}
            >
                <SelectPrimitive.Value placeholder={placeholder} />
                <SelectPrimitive.Icon className="shrink-0 text-fg-2">
                    <ChevronDown aria-hidden="true" size={20} strokeWidth={1.5} />
                </SelectPrimitive.Icon>
            </SelectPrimitive.Trigger>
            <SelectPrimitive.Portal>
                <SelectPrimitive.Content
                    position="popper"
                    sideOffset={4}
                    className="z-50 max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) overflow-hidden rounded-md border border-border bg-surface shadow-raised"
                >
                    <SelectPrimitive.Viewport className="p-1">
                        {options.map((o) => (
                            <SelectPrimitive.Item
                                key={o.value}
                                value={o.value}
                                disabled={o.disabled}
                                className="flex min-h-11 cursor-default items-center justify-between gap-3 rounded-sm px-3 text-base text-fg outline-none select-none data-disabled:text-fg-3 data-highlighted:bg-accent-soft data-highlighted:text-accent-text"
                            >
                                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                                <SelectPrimitive.ItemIndicator>
                                    <Check aria-hidden="true" size={16} strokeWidth={1.5} />
                                </SelectPrimitive.ItemIndicator>
                            </SelectPrimitive.Item>
                        ))}
                    </SelectPrimitive.Viewport>
                </SelectPrimitive.Content>
            </SelectPrimitive.Portal>
        </SelectPrimitive.Root>
    );
}

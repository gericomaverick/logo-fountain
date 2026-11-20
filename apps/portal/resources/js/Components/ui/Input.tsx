import type { ComponentPropsWithRef } from 'react';

import { controlClass, useFieldControl } from '@/Components/ui/Field';

/**
 * UX §11 Input: default · focus · error · disabled · read-only. Always inside a <Field> (a visible
 * label, never placeholder-as-label); id, aria-describedby and aria-invalid come from the Field.
 */
type Props = Omit<ComponentPropsWithRef<'input'>, 'className' | 'style' | 'id' | 'aria-describedby' | 'aria-invalid'>;

export function Input({ type = 'text', ...rest }: Props) {
    const { invalid, ...wiring } = useFieldControl();
    return <input {...rest} {...wiring} type={type} className={controlClass(invalid)} />;
}

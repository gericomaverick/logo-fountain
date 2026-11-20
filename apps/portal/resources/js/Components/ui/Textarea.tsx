import type { ComponentPropsWithRef } from 'react';

import { controlClass, useFieldControl } from '@/Components/ui/Field';
import { cx } from '@/lib/ui';

/** UX §11 Textarea: as Input, multi-line, vertically resizable. Pair a limit with Field `count`. */
type Props = Omit<ComponentPropsWithRef<'textarea'>, 'className' | 'style' | 'id' | 'aria-describedby' | 'aria-invalid'>;

export function Textarea({ rows = 4, ...rest }: Props) {
    const { invalid, ...wiring } = useFieldControl();
    return <textarea {...rest} {...wiring} rows={rows} className={cx(controlClass(invalid), 'min-h-24 resize-y')} />;
}

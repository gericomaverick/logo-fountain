import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { ReactNode } from 'react';

import { cx } from '@/lib/ui';

/**
 * UX §11 Tabs★ (Radix Tabs, ADR-022, UX §7; story 1.8c): top (desktop) · bottom bar (phone).
 * - Roving focus: one tab stop for the whole list; Left/Right (and Home/End) move between tabs and
 *   select them (automatic activation); Tab moves into the panel.
 * - The "new" dot badge (UX §5: Concepts and Messages, from the read-state rules; never a count)
 *   is decorative, and the tab's accessible name says it: "Concepts, new".
 * - `placement="bottom"` renders the phone bottom bar (icon above label, the list after the
 *   panels). The 1.9 shells fix it to the viewport and switch at `md` (§13); this component only
 *   draws it.
 */
export type TabItem = {
    value: string;
    label: string;
    /** A Lucide icon (decorative), shown above the label in the bottom bar. */
    icon?: ReactNode;
    /** Shows the dot and adds ", new" to the accessible name. */
    isNew?: boolean;
    disabled?: boolean;
    content: ReactNode;
};

type Props = {
    /** The tab list's accessible name, e.g. "Project sections". */
    label: string;
    items: readonly TabItem[];
    value?: string;
    defaultValue?: string;
    onValueChange?: (value: string) => void;
    placement?: 'top' | 'bottom';
};

/** The visually hidden suffix that names the badge. */
export const NEW_BADGE_TEXT = ', new';

export function Tabs({ label, items, value, defaultValue, onValueChange, placement = 'top' }: Props) {
    const bottom = placement === 'bottom';
    const list = (
        <TabsPrimitive.List
            aria-label={label}
            data-placement={placement}
            className={bottom ? 'grid auto-cols-fr grid-flow-col border-t border-divider bg-surface' : 'flex gap-1 overflow-x-auto border-b border-divider'}
        >
            {items.map((item) => (
                <TabsPrimitive.Trigger
                    key={item.value}
                    value={item.value}
                    disabled={item.disabled}
                    className={cx(
                        'group relative inline-flex items-center justify-center gap-2 text-sm font-medium whitespace-nowrap text-fg-2 transition-colors',
                        'hover:text-fg data-[state=active]:text-accent-text data-disabled:cursor-not-allowed data-disabled:text-fg-3',
                        'after:absolute after:inset-x-0 after:h-0.5 after:rounded-full after:bg-transparent data-[state=active]:after:bg-accent',
                        bottom ? 'min-h-14 flex-col gap-1 px-2 py-2 after:top-0' : 'min-h-11 px-3 after:bottom-0',
                    )}
                >
                    {bottom && item.icon ? <span className="relative inline-flex">{item.icon}{item.isNew ? <Dot corner /> : null}</span> : null}
                    <span className={cx('inline-flex items-center gap-2', bottom && 'text-xs')}>
                        {item.label}
                        {item.isNew && !(bottom && item.icon) ? <Dot /> : null}
                    </span>
                    {item.isNew ? <span className="sr-only">{NEW_BADGE_TEXT}</span> : null}
                </TabsPrimitive.Trigger>
            ))}
        </TabsPrimitive.List>
    );

    return (
        <TabsPrimitive.Root
            {...(value === undefined ? {} : { value })}
            {...(defaultValue === undefined ? {} : { defaultValue })}
            {...(onValueChange ? { onValueChange } : {})}
            activationMode="automatic"
            className={cx('flex flex-col', bottom ? 'gap-0' : 'gap-6')}
        >
            {bottom ? null : list}
            {items.map((item) => (
                <TabsPrimitive.Content key={item.value} value={item.value} className={cx('min-w-0 text-base text-fg', bottom && 'p-4')}>
                    {item.content}
                </TabsPrimitive.Content>
            ))}
            {bottom ? list : null}
        </TabsPrimitive.Root>
    );
}

/** The "new" dot: decorative (the tab's name says "new"), accent so it reads in both themes. */
function Dot({ corner = false }: { corner?: boolean }) {
    return <span aria-hidden="true" data-badge="new" className={cx('size-2 shrink-0 rounded-full bg-accent', corner && 'absolute -top-0.5 -right-1.5')} />;
}

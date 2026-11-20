import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { ReactNode } from 'react';

import { cx } from '@/lib/ui';

/**
 * UX §11 Tabs★ (Radix Tabs, ADR-022, UX §7; story 1.8c): top (desktop) · bottom bar (phone).
 * - Roving focus: one tab stop for the whole list; Left/Right (and Home/End) move between tabs and
 *   select them (automatic activation); Tab moves into the panel.
 * - The "new" dot badge (UX §5: Concepts and Messages, from the read-state rules; never a count)
 *   is decorative, and the tab's accessible name says it: aria-label "Concepts, new" (which
 *   starts with the visible label, WCAG 2.5.3).
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

/** The accessible-name suffix that says the badge. */
export const NEW_BADGE_TEXT = ', new';

/** The tab list's look, shared with TabNav (story 1.9: URL-routed sections as links). */
export const tabListClass = (bottom: boolean) => (bottom ? 'grid auto-cols-fr grid-flow-col border-t border-divider bg-surface' : 'flex gap-1 overflow-x-auto border-b border-divider');

/** One tab's look. Selected = Radix `data-state=active` (Tabs) or `aria-current=page` / `data-active` (TabNav). */
export const tabClass = (bottom: boolean) =>
    cx(
        'group relative inline-flex items-center justify-center gap-2 text-sm font-medium whitespace-nowrap text-fg-2 transition-colors',
        'hover:text-fg data-[state=active]:text-accent-text data-disabled:cursor-not-allowed data-disabled:text-fg-3',
        'aria-[current=page]:text-accent-text data-active:text-accent-text',
        'after:absolute after:inset-x-0 after:h-0.5 after:rounded-full after:bg-transparent data-[state=active]:after:bg-accent aria-[current=page]:after:bg-accent data-active:after:bg-accent',
        bottom ? 'min-h-14 flex-col gap-1 px-2 py-2 after:top-0' : 'min-h-11 px-3 after:bottom-0',
    );

export function Tabs({ label, items, value, defaultValue, onValueChange, placement = 'top' }: Props) {
    const bottom = placement === 'bottom';
    const list = (
        <TabsPrimitive.List aria-label={label} data-placement={placement} className={tabListClass(bottom)}>
            {items.map((item) => (
                <TabsPrimitive.Trigger
                    key={item.value}
                    value={item.value}
                    disabled={item.disabled}
                    aria-label={item.isNew ? `${item.label}${NEW_BADGE_TEXT}` : undefined}
                    className={tabClass(bottom)}
                >
                    <TabLabel label={item.label} icon={item.icon} isNew={item.isNew} bottom={bottom} />
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

/** A tab's visible content: icon above the label in the bottom bar, and the "new" dot. Shared with TabNav. */
export function TabLabel({ label, icon, isNew = false, bottom }: { label: string; icon?: ReactNode; isNew?: boolean | undefined; bottom: boolean }) {
    return (
        <>
            {bottom && icon ? (
                <span className="relative inline-flex">
                    {icon}
                    {isNew ? <Dot corner /> : null}
                </span>
            ) : null}
            <span className={cx('inline-flex items-center gap-2', bottom && 'text-xs')}>
                {label}
                {isNew && !(bottom && icon) ? <Dot /> : null}
            </span>
        </>
    );
}

/** The "new" dot: decorative (the tab's name says "new"), accent so it reads in both themes. */
function Dot({ corner = false }: { corner?: boolean }) {
    return <span aria-hidden="true" data-badge="new" className={cx('size-2 shrink-0 rounded-full bg-accent', corner && 'absolute -top-0.5 -right-1.5')} />;
}

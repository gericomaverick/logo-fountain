import { Link as InertiaLink } from '@inertiajs/react';
import type { ReactNode } from 'react';

import { NEW_BADGE_TEXT, TabLabel, tabClass, tabListClass } from '@/Components/ui/Tabs';
import { cx } from '@/lib/ui';

/**
 * Section tabs that are pages (UX §5 project sections; story 1.9). Each section has its own URL
 * (an Inertia page), so this is a `<nav>` of links with `aria-current="page"`, styled like the
 * 1.8c Tabs. ARIA `tablist` semantics are only for panels switched in place (use `Tabs` there):
 * a tab role would promise arrow-key switching without a page load, and hide the link's
 * "open in new tab" and history behaviour.
 * - Tab moves link to link (no roving focus); Enter follows the link.
 * - The "new" dot is decorative; the link's name says it: aria-label "Concepts, new" (visible label
 *   first, WCAG 2.5.3), as in Tabs.
 * - `placement="bottom"` is the phone bottom bar (icon above label). The shells fix it to the
 *   viewport below `md` (UX §13); `trailing` adds an item such as the "More" overflow menu.
 */
export type TabNavItem = {
    key: string;
    label: string;
    href: string;
    /** A Lucide icon (decorative), shown above the label in the bottom bar. */
    icon?: ReactNode;
    /** Shows the dot and adds ", new" to the link's name. */
    isNew?: boolean;
};

type Props = {
    /** The nav landmark's name, e.g. "Project sections". */
    label: string;
    items: readonly TabNavItem[];
    /** The current section's key (gets aria-current="page"), or null. */
    current: string | null;
    placement?: 'top' | 'bottom';
    trailing?: ReactNode;
    className?: string;
};

export function TabNav({ label, items, current, placement = 'top', trailing, className }: Props) {
    const bottom = placement === 'bottom';
    return (
        <nav aria-label={label} data-placement={placement} className={className}>
            <ul className={tabListClass(bottom)}>
                {items.map((item) => (
                    <li key={item.key} className="flex">
                        <InertiaLink
                            href={item.href}
                            aria-current={item.key === current ? 'page' : undefined}
                            aria-label={item.isNew ? `${item.label}${NEW_BADGE_TEXT}` : undefined}
                            className={cx(tabClass(bottom), 'w-full rounded-sm no-underline')}
                        >
                            <TabLabel label={item.label} icon={item.icon} isNew={item.isNew} bottom={bottom} />
                        </InertiaLink>
                    </li>
                ))}
                {trailing ? <li className="flex">{trailing}</li> : null}
            </ul>
        </nav>
    );
}

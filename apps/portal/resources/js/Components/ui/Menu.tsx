import { Link as InertiaLink } from '@inertiajs/react';
import * as MenuPrimitive from '@radix-ui/react-dropdown-menu';
import type { ReactElement, ReactNode } from 'react';

import { cx, usesNativeAnchor } from '@/lib/ui';

/**
 * UX §11 Menu★ / Dropdown (Radix DropdownMenu, ADR-022): the user menu and admin actions.
 * Radix gives the menu-button pattern: Enter/Space/↓ opens, arrows move, typeahead, Esc closes
 * and returns focus to the trigger. Items are 44 px on touch. A danger item is red text plus a
 * label that names the consequence (colour never alone).
 */
type MenuProps = {
    /** The button that opens it, e.g. <Button variant="secondary">Actions</Button>. */
    trigger: ReactElement;
    align?: 'start' | 'end';
    children: ReactNode;
};

export function Menu({ trigger, align = 'end', children }: MenuProps) {
    return (
        <MenuPrimitive.Root>
            <MenuPrimitive.Trigger asChild>{trigger}</MenuPrimitive.Trigger>
            <MenuPrimitive.Portal>
                <MenuPrimitive.Content
                    align={align}
                    sideOffset={4}
                    className="z-50 flex min-w-48 flex-col rounded-md border border-border bg-surface p-1 shadow-raised"
                >
                    {children}
                </MenuPrimitive.Content>
            </MenuPrimitive.Portal>
        </MenuPrimitive.Root>
    );
}

type ItemProps = {
    children: ReactNode;
    icon?: ReactNode;
    tone?: 'default' | 'danger';
    disabled?: boolean;
} & ({ onSelect: () => void; href?: never } | { href: string; onSelect?: never });

const itemClass = (tone: 'default' | 'danger') =>
    cx(
        'flex min-h-9 cursor-default items-center gap-2 rounded-sm px-3 text-sm font-medium outline-none select-none pointer-coarse:min-h-11',
        'data-disabled:cursor-not-allowed data-disabled:text-fg-3',
        tone === 'danger' ? 'text-danger data-highlighted:bg-danger-soft' : 'text-fg data-highlighted:bg-accent-soft data-highlighted:text-accent-text',
    );

export function MenuItem({ children, icon, tone = 'default', disabled, onSelect, href }: ItemProps) {
    if (href !== undefined) {
        const content = (
            <>
                {icon}
                {children}
            </>
        );
        return (
            <MenuPrimitive.Item asChild disabled={disabled} className={itemClass(tone)}>
                {usesNativeAnchor(href) ? <a href={href}>{content}</a> : <InertiaLink href={href}>{content}</InertiaLink>}
            </MenuPrimitive.Item>
        );
    }
    return (
        <MenuPrimitive.Item disabled={disabled} onSelect={onSelect} className={itemClass(tone)}>
            {icon}
            {children}
        </MenuPrimitive.Item>
    );
}

export function MenuSeparator() {
    return <MenuPrimitive.Separator className="my-1 h-px bg-divider" />;
}

/** A non-interactive heading inside the menu, e.g. "Signed in as …". */
export function MenuLabel({ children }: { children: ReactNode }) {
    return <MenuPrimitive.Label className="px-3 py-2 text-sm text-fg-3">{children}</MenuPrimitive.Label>;
}

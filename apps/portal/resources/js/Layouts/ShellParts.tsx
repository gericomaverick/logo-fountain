import { Link as InertiaLink } from '@inertiajs/react';
import { CircleUser, LogOut, Receipt, UserRound } from 'lucide-react';

import { Button } from '@/Components/ui/Button';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '@/Components/ui/Menu';
import { ThemeMenuItems } from '@/Components/ui/ThemeSwitcher';
import { cx } from '@/lib/ui';

/**
 * Pieces shared by the customer and admin shells (story 1.9, UX §5, §13). Presentational: the
 * user and links come in as props (real auth arrives in Epic 4).
 */
export type ShellUser = { name: string; email: string };

export type UserMenuProps = {
    user: ShellUser;
    accountHref: string;
    /** Customers only (UX §5.1: Account › Invoices). */
    invoicesHref?: string;
    onSignOut: () => void;
};

/** The id the skip link jumps to; `main` carries it. */
export const MAIN_ID = 'main';

/** §13: the first tab stop, visible on focus; moves focus to the main landmark. */
export function SkipLink() {
    return (
        <a
            href={`#${MAIN_ID}`}
            className="sr-only z-70 rounded-md bg-surface px-4 py-3 text-sm font-semibold text-accent-text underline shadow-overlay focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
            Skip to main content
        </a>
    );
}

/** The product name, linking home. */
export function Brand({ href, suffix }: { href: string; suffix?: string }) {
    return (
        <InertiaLink href={href} className="inline-flex min-h-11 items-center gap-2 rounded-sm text-base font-semibold whitespace-nowrap text-fg no-underline">
            Logo Fountain
            {suffix ? <span className="rounded-sm bg-accent-soft px-1.5 text-xs font-medium text-accent-text">{suffix}</span> : null}
        </InertiaLink>
    );
}

/**
 * The user menu (UX §5.1 Account, §8.1 theme): who's signed in, Account (and Invoices for
 * customers), the theme, and Sign out.
 */
export function UserMenu({ user, accountHref, invoicesHref, onSignOut, className }: UserMenuProps & { className?: string }) {
    return (
        <div className={cx('min-w-0', className)}>
            <Menu
                trigger={
                    // The name starts with the visible text (WCAG 2.5.3); aria-label, as a hidden suffix adds a stray space.
                    <Button variant="ghost" size="sm" aria-label={`${user.name}, account menu`} icon={<CircleUser aria-hidden="true" size={20} strokeWidth={1.5} />}>
                        {/* Icon-only below sm, so the phone top bar fits on one line; the name stays in the label. */}
                        <span className="hidden max-w-40 truncate sm:inline">{user.name}</span>
                    </Button>
                }
            >
                <MenuLabel>Signed in as {user.email}</MenuLabel>
                <MenuItem href={accountHref} icon={<UserRound aria-hidden="true" size={16} strokeWidth={1.5} />}>
                    Account
                </MenuItem>
                {invoicesHref ? (
                    <MenuItem href={invoicesHref} icon={<Receipt aria-hidden="true" size={16} strokeWidth={1.5} />}>
                        Invoices
                    </MenuItem>
                ) : null}
                <MenuSeparator />
                <ThemeMenuItems />
                <MenuSeparator />
                <MenuItem onSelect={onSignOut} icon={<LogOut aria-hidden="true" size={16} strokeWidth={1.5} />}>
                    Sign out
                </MenuItem>
            </Menu>
        </div>
    );
}

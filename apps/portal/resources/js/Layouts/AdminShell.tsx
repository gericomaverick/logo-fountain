import { Link as InertiaLink } from '@inertiajs/react';
import { Activity, Inbox, Menu as MenuIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { Breadcrumbs } from '@/Components/ui/Breadcrumbs';
import { Button } from '@/Components/ui/Button';
import { Menu, MenuItem } from '@/Components/ui/Menu';
import { TabNav } from '@/Components/ui/TabNav';
import { ToastProvider } from '@/Components/ui/Toast';
import { Brand, MAIN_ID, SkipLink, UserMenu, type UserMenuProps } from '@/Layouts/ShellParts';
import { cx } from '@/lib/ui';

/**
 * The admin shell (UX §5.2, §13; story 1.9). Desktop first (full support from `lg`, 1024 px).
 * - Left sidebar (the banner landmark): brand, the "Admin" nav (Queue, Health) and the user menu
 *   (Account, theme, Sign out). Below `lg` it's a top bar and the nav collapses into a "Menu".
 * - Workspace: main (`#main`) with, inside a project, breadcrumbs (Queue › Brand) and the
 *   "Project sections" nav (Overview · Concepts · Messages · Brief · Files · Audit: links with
 *   aria-current, as in the customer shell).
 * - Properties column: an `aside` named "Project properties", 360 px beside main from `lg`,
 *   stacked under the main content below it (UX §13). Destructive actions belong in its separate
 *   "Actions" area (§5.2), supplied by the page.
 * - ToastProvider is mounted here. No display type in admin (UX §8.2; the design lint enforces it).
 */
export type AdminArea = 'queue' | 'health';
export type AdminSection = 'overview' | 'concepts' | 'messages' | 'brief' | 'files' | 'audit';

const AREAS: ReadonlyArray<{ key: AdminArea; label: string; icon: ReactNode }> = [
    { key: 'queue', label: 'Queue', icon: <Inbox aria-hidden="true" size={20} strokeWidth={1.5} /> },
    { key: 'health', label: 'Health', icon: <Activity aria-hidden="true" size={20} strokeWidth={1.5} /> },
];

export const ADMIN_SECTIONS: ReadonlyArray<{ key: AdminSection; label: string }> = [
    { key: 'overview', label: 'Overview' },
    { key: 'concepts', label: 'Concepts' },
    { key: 'messages', label: 'Messages' },
    { key: 'brief', label: 'Brief' },
    { key: 'files', label: 'Files' },
    { key: 'audit', label: 'Audit' },
];

type Props = {
    /** The sidebar area this page belongs to (a project workspace belongs to Queue). */
    area: AdminArea;
    areaHrefs: Record<AdminArea, string>;
    userMenu: Omit<UserMenuProps, 'invoicesHref'>;
    project?: {
        name: string;
        current: AdminSection;
        hrefs: Record<AdminSection, string>;
        /** Unread / pending markers on sections (e.g. feedback waiting), shown as dots. */
        isNew?: Partial<Record<AdminSection, boolean>>;
    };
    /** The properties column (status, client, package, allowances, order, quick actions). */
    properties?: ReactNode;
    children: ReactNode;
};

export function AdminShell({ area, areaHrefs, userMenu, project, properties, children }: Props) {
    return (
        <ToastProvider>
            <div className="min-h-dvh bg-bg text-fg lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
                <SkipLink />
                <header className="flex items-center justify-between gap-2 border-b border-divider bg-sunken px-4 py-1 lg:sticky lg:top-0 lg:h-dvh lg:flex-col lg:items-stretch lg:justify-start lg:gap-6 lg:border-r lg:border-b-0 lg:py-4">
                    <Brand href={areaHrefs.queue} suffix="Admin" />
                    <nav aria-label="Admin" className="hidden lg:block lg:flex-1">
                        <ul className="flex flex-col gap-1">
                            {AREAS.map((a) => (
                                <li key={a.key}>
                                    <InertiaLink
                                        href={areaHrefs[a.key]}
                                        aria-current={a.key === area ? 'page' : undefined}
                                        className={cx(
                                            'flex min-h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-fg-2 no-underline transition-colors hover:bg-surface hover:text-fg',
                                            'aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent-text',
                                        )}
                                    >
                                        {a.icon}
                                        {a.label}
                                    </InertiaLink>
                                </li>
                            ))}
                        </ul>
                    </nav>
                    <div className="flex items-center gap-1 lg:flex-col lg:items-stretch">
                        <div className="lg:hidden">
                            <Menu trigger={<Button variant="ghost" size="sm" icon={<MenuIcon aria-hidden="true" size={20} strokeWidth={1.5} />}>Menu</Button>}>
                                {AREAS.map((a) => (
                                    <MenuItem key={a.key} href={areaHrefs[a.key]} icon={a.icon}>
                                        {a.label}
                                    </MenuItem>
                                ))}
                            </Menu>
                        </div>
                        <UserMenu {...userMenu} />
                    </div>
                </header>
                <div className={cx('min-w-0', Boolean(properties) && 'lg:grid lg:grid-cols-[minmax(0,1fr)_360px]')}>
                    <main id={MAIN_ID} tabIndex={-1} className="flex min-w-0 flex-col gap-6 px-4 py-6 outline-none md:px-6 lg:px-8">
                        {project ? (
                            <div className="flex flex-col gap-3">
                                <Breadcrumbs items={[{ label: 'Queue', href: areaHrefs.queue }, { label: project.name }]} />
                                <TabNav
                                    label="Project sections"
                                    current={project.current}
                                    items={ADMIN_SECTIONS.map((s) => ({ key: s.key, label: s.label, href: project.hrefs[s.key], isNew: Boolean(project.isNew?.[s.key]) }))}
                                />
                            </div>
                        ) : null}
                        {children}
                    </main>
                    {properties ? (
                        <aside aria-label="Project properties" className="flex flex-col gap-4 border-t border-divider px-4 py-6 md:px-6 lg:border-t-0 lg:border-l lg:px-6">
                            {properties}
                        </aside>
                    ) : null}
                </div>
            </div>
        </ToastProvider>
    );
}

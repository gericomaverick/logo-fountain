import { Ellipsis, FileText, Folder, Images, LayoutDashboard, MessageSquare } from 'lucide-react';
import type { ReactNode } from 'react';

import { Breadcrumbs, type Crumb } from '@/Components/ui/Breadcrumbs';
import { Menu, MenuItem } from '@/Components/ui/Menu';
import { TabNav, type TabNavItem } from '@/Components/ui/TabNav';
import { tabClass } from '@/Components/ui/Tabs';
import { ToastProvider } from '@/Components/ui/Toast';
import { Brand, MAIN_ID, SkipLink, UserMenu, type UserMenuProps } from '@/Layouts/ShellParts';
import { cx } from '@/lib/ui';

/**
 * The customer shell (UX §5.1, §5.3, §13; story 1.9). Phone first.
 * - Landmarks: banner (top bar: brand + user menu with Account, Invoices, theme, Sign out),
 *   "Breadcrumb" nav, "Project sections" nav, main (`#main`, the skip link's target). The page
 *   inside renders the one h1.
 * - Project sections are separate pages, so the tabs are a nav of links with aria-current
 *   (TabNav), not ARIA tabs. At `md` and up: a top tab bar with all five (Overview · Concepts ·
 *   Messages · Brief · Files). Below `md`: a fixed bottom bar with Overview · Concepts · Messages ·
 *   Files plus a "More" overflow holding Brief (UX §5.1; Brief is also linked from Overview).
 * - Dot badges for "new" on Concepts and Messages, never counts; the link's name says "new".
 * - ToastProvider is mounted here, lifted above the bottom bar on phones.
 * Presentational: user, project and links come in as props (real data arrives in Epics 4–7).
 */
export type CustomerSection = 'overview' | 'concepts' | 'messages' | 'brief' | 'files';

export const CUSTOMER_SECTIONS: ReadonlyArray<{ key: CustomerSection; label: string; icon: ReactNode; phone: boolean }> = [
    { key: 'overview', label: 'Overview', icon: <LayoutDashboard aria-hidden="true" size={20} strokeWidth={1.5} />, phone: true },
    { key: 'concepts', label: 'Concepts', icon: <Images aria-hidden="true" size={20} strokeWidth={1.5} />, phone: true },
    { key: 'messages', label: 'Messages', icon: <MessageSquare aria-hidden="true" size={20} strokeWidth={1.5} />, phone: true },
    { key: 'brief', label: 'Brief', icon: <FileText aria-hidden="true" size={20} strokeWidth={1.5} />, phone: false },
    { key: 'files', label: 'Files', icon: <Folder aria-hidden="true" size={20} strokeWidth={1.5} />, phone: true },
];

export type CustomerProjectNav = {
    current: CustomerSection;
    hrefs: Record<CustomerSection, string>;
    /** The "new" dots (read-state rules, UX §5.1). */
    isNew?: Partial<Record<'concepts' | 'messages', boolean>>;
};

type Props = {
    homeHref: string;
    userMenu: UserMenuProps;
    breadcrumbs?: readonly Crumb[];
    /** Inside a project: the section tabs. Omit on Projects, Account and Invoices. */
    project?: CustomerProjectNav;
    children: ReactNode;
};

const SECTIONS_LABEL = 'Project sections';

export function CustomerShell({ homeHref, userMenu, breadcrumbs, project, children }: Props) {
    const items = (phone: boolean): TabNavItem[] =>
        CUSTOMER_SECTIONS.filter((s) => !phone || s.phone).map((s) => ({
            key: s.key,
            label: s.label,
            href: project?.hrefs[s.key] ?? '#',
            icon: s.icon,
            isNew: s.key === 'concepts' || s.key === 'messages' ? Boolean(project?.isNew?.[s.key]) : false,
        }));

    return (
        <ToastProvider aboveTabBar={Boolean(project)}>
            <div className="flex min-h-dvh flex-col bg-bg text-fg">
                <SkipLink />
                <header className="border-b border-divider bg-surface">
                    <div className="mx-auto flex max-w-content items-center justify-between gap-4 px-4 py-1 md:px-6 lg:px-10">
                        <Brand href={homeHref} />
                        <UserMenu {...userMenu} />
                    </div>
                </header>
                {breadcrumbs?.length || project ? (
                    <div className="mx-auto flex w-full max-w-content flex-col gap-3 px-4 pt-4 md:px-6 lg:px-10">
                        {breadcrumbs?.length ? <Breadcrumbs items={breadcrumbs} /> : null}
                        {project ? <TabNav label={SECTIONS_LABEL} items={items(false)} current={project.current} className="hidden md:block" /> : null}
                    </div>
                ) : null}
                <main id={MAIN_ID} tabIndex={-1} className={cx('mx-auto flex w-full max-w-content flex-1 flex-col gap-6 px-4 py-6 outline-none md:px-6 md:pb-10 lg:px-10', project && 'pb-28')}>
                    {children}
                </main>
                {project ? (
                    <TabNav
                        label={SECTIONS_LABEL}
                        placement="bottom"
                        items={items(true)}
                        current={project.current}
                        trailing={<MoreMenu briefHref={project.hrefs.brief} briefCurrent={project.current === 'brief'} />}
                        className="fixed inset-x-0 bottom-0 z-40 bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
                    />
                ) : null}
            </div>
        </ToastProvider>
    );
}

/** The phone bottom bar's overflow: Brief (UX §5.1). Marked active while the Brief page is open. */
function MoreMenu({ briefHref, briefCurrent }: { briefHref: string; briefCurrent: boolean }) {
    return (
        <Menu
            align="end"
            trigger={
                <button
                    type="button"
                    data-active={briefCurrent ? '' : undefined}
                    aria-label={briefCurrent ? 'More, Brief is open' : undefined}
                    className={cx(tabClass(true), 'w-full rounded-sm')}
                >
                    <Ellipsis aria-hidden="true" size={20} strokeWidth={1.5} />
                    <span className="text-xs">More</span>
                </button>
            }
        >
            <MenuItem href={briefHref} icon={<FileText aria-hidden="true" size={16} strokeWidth={1.5} />}>
                Brief
            </MenuItem>
        </Menu>
    );
}

import { Head, router } from '@inertiajs/react';
import { FolderOpen } from 'lucide-react';

import { Card, CardLink } from '@/Components/ui/Card';
import { EmptyState } from '@/Components/ui/EmptyState';
import { StatusPill } from '@/Components/ui/StatusPill';
import { CustomerShell } from '@/Layouts/CustomerShell';
import { logoutAndVerifySession } from '@/lib/auth';

/**
 * Story 6.1 (C-01, UX §5.3, §12, §14): the Projects list. Reached only with zero or two-plus projects (one project
 * goes straight to its Overview, in DashboardController). Each card's one target is the project name; the turn pill
 * says whose move it is; "new" dots are text-labelled, never counts.
 */
export type ProjectRow = {
    id: string;
    status: string;
    packageCode: string;
    name: string | null;
    hasNewConcepts: boolean;
    hasNewMessages: boolean;
};

type Props = { projects: ProjectRow[]; user: { name: string; email: string } };

const PACKAGE = (code: string) => code.charAt(0).toUpperCase() + code.slice(1);

export default function Dashboard({ projects, user }: Props) {
    const first = user.name.trim().split(/\s+/)[0] || 'there';
    const userMenu = {
        user,
        accountHref: '/account',
        invoicesHref: '/invoices',
        onSignOut: () => void logoutAndVerifySession().then(() => router.visit('/login')).catch(() => undefined),
    };
    return (
        <CustomerShell homeHref="/dashboard" userMenu={userMenu} breadcrumbs={[{ label: 'Projects' }]}>
            <Head title="Projects" />
            <h1 className="text-2xl font-semibold text-fg">Welcome, {first}</h1>
            {projects.length === 0 ? (
                <EmptyState title="No projects yet" icon={FolderOpen}>
                    Your projects will appear here once you have ordered a package.
                </EmptyState>
            ) : (
                <ul aria-label="Your projects" className="grid gap-4 md:grid-cols-2">
                    {projects.map((p) => {
                        const name = p.name ?? 'Your project';
                        const news = [p.hasNewConcepts ? 'New concepts' : null, p.hasNewMessages ? 'New message' : null].filter(Boolean) as string[];
                        return (
                            <li key={p.id} className="flex">
                                <Card variant="interactive" as="article">
                                    <h2 className="text-lg font-semibold">
                                        <CardLink href={`/project/${p.id}`}>{name}</CardLink>
                                    </h2>
                                    <StatusPill state={p.status} />
                                    <p className="text-sm text-fg-3">{PACKAGE(p.packageCode)} package</p>
                                    {news.length > 0 ? (
                                        <p className="flex items-center gap-2 text-sm text-fg-2" data-new>
                                            <span aria-hidden="true" className="size-2 rounded-full bg-accent" />
                                            {news.join(' · ')}
                                        </p>
                                    ) : null}
                                </Card>
                            </li>
                        );
                    })}
                </ul>
            )}
        </CustomerShell>
    );
}

import { Head } from '@inertiajs/react';
import { FileText, Folder, Images, MessageSquare, ScrollText } from 'lucide-react';
import type { ReactNode } from 'react';

import { AllowanceMeter } from '@/Components/ui/AllowanceMeter';
import { Button } from '@/Components/ui/Button';
import { Panel } from '@/Components/ui/Card';
import { DataTable, type Column } from '@/Components/ui/DataTable';
import { EmptyState } from '@/Components/ui/EmptyState';
import { Link } from '@/Components/ui/Link';
import { PropertiesPanel } from '@/Components/ui/PropertiesPanel';
import { StageTracker } from '@/Components/ui/StageTracker';
import { useToast } from '@/Components/ui/Toast';
import { TurnBanner } from '@/Components/ui/TurnBanner';
import { AdminShell, type AdminSection } from '@/Layouts/AdminShell';
import { CustomerShell, type CustomerSection } from '@/Layouts/CustomerShell';
import { bannerCopy, buildTimeline } from '@/lib/status';

/**
 * /dev/ui/shells (customer) and /dev/ui/shells/admin: the story 1.9 app shells with sample props,
 * local and testing only (routes/web.php). `?section=` picks the page, so the section tabs are
 * real links between URLs, as they will be in Epics 6–7. tests/browser/ui-shells.spec.ts
 * screenshots and drives them, and Lighthouse CI measures the customer Overview (NFR-P2) until a
 * seeded real Overview exists (Epic 6). Each view keeps one primary button (UX §11).
 */
type Props = { shell: 'customer' | 'admin'; section: string };

const USER = { name: 'Alex Morgan', email: 'alex@northvale.example' };
const ADMIN = { name: 'Sam Designer', email: 'sam@logofountain.example' };
const PROJECT = 'Northvale Coffee';
const noop = () => {};

const customerHref = (section: string) => `/dev/ui/shells?section=${section}`;
const adminHref = (section: string) => `/dev/ui/shells/admin?section=${section}`;

export default function UiShells({ shell, section }: Props) {
    return shell === 'admin' ? <Admin section={section} /> : <Customer section={section} />;
}

// ---------- Customer ----------
const CUSTOMER_LABELS: Record<CustomerSection, string> = { overview: 'Overview', concepts: 'Concepts', messages: 'Messages', brief: 'Brief', files: 'Files' };

function Customer({ section }: { section: string }) {
    const userMenu = { user: USER, accountHref: customerHref('account'), invoicesHref: customerHref('invoices'), onSignOut: noop };
    if (!(section in CUSTOMER_LABELS)) {
        // Outside a project (Projects, Account, Invoices): no section tabs.
        return (
            <CustomerShell homeHref={customerHref('projects')} userMenu={userMenu}>
                <Head title="UI catalogue: customer shell" />
                <Intro title="Your projects" shell="customer" />
                <EmptyState title="Northvale Coffee" icon={Images} action={<Link href={customerHref('overview')} variant="standalone">Open project</Link>}>
                    A sample project row. The Projects list appears only with two or more projects (UX §5.3).
                </EmptyState>
            </CustomerShell>
        );
    }
    const current = section as CustomerSection;
    const hrefs = Object.fromEntries(Object.keys(CUSTOMER_LABELS).map((k) => [k, customerHref(k)])) as Record<CustomerSection, string>;
    const crumbs = [{ label: 'Projects', href: customerHref('projects') }, { label: PROJECT, href: hrefs.overview }, ...(current === 'overview' ? [] : [{ label: CUSTOMER_LABELS[current] }])];
    return (
        <CustomerShell homeHref={customerHref('projects')} userMenu={userMenu} breadcrumbs={crumbs} project={{ current, hrefs, isNew: { concepts: true, messages: true } }}>
            <Head title="UI catalogue: customer shell" />
            <Intro title={current === 'overview' ? PROJECT : CUSTOMER_LABELS[current]} shell="customer" />
            {current === 'overview' ? <CustomerOverview hrefs={hrefs} /> : <SectionPlaceholder label={CUSTOMER_LABELS[current]} />}
        </CustomerShell>
    );
}

/** A representative Overview (UX §14 priority order): turn banner + its one primary, tracker, allowances, shortcuts. */
function CustomerOverview({ hrefs }: { hrefs: Record<CustomerSection, string> }) {
    const timeline = buildTimeline('CONCEPTS_READY', {
        AWAITING_BRIEF: '2026-11-02T09:15:00Z',
        BRIEF_SUBMITTED: '2026-11-03T14:40:00Z',
        IN_DESIGN: '2026-11-04T10:00:00Z',
        CONCEPTS_READY: '2026-11-10T16:20:00Z',
    });
    return (
        <>
            <TurnBanner state="CONCEPTS_READY" action={<Button variant="primary" width="phone">{bannerCopy('CONCEPTS_READY').actionLabel}</Button>} />
            <Panel title="Progress">
                <StageTracker timeline={timeline} label="Project progress" />
            </Panel>
            <div className="grid gap-6 md:grid-cols-2">
                <Panel title="Concepts">
                    <AllowanceMeter label="Concepts" as="h3" noun={{ one: 'concept', many: 'concepts' }} usage={{ limit: 3, consumed: 3, reserved: 0 }} />
                </Panel>
                <Panel title="Revisions">
                    <AllowanceMeter label="Revisions" as="h3" noun={{ one: 'revision', many: 'revisions' }} usage={{ limit: 2, consumed: 0, reserved: 1 }} />
                </Panel>
            </div>
            <Panel title="Shortcuts">
                <ul className="flex flex-col gap-2">
                    <li>
                        <Link href={hrefs.brief} variant="standalone">
                            <FileText aria-hidden="true" size={16} strokeWidth={1.5} />
                            Your brief
                        </Link>
                    </li>
                    <li>
                        <Link href={hrefs.files} variant="standalone">
                            <Folder aria-hidden="true" size={16} strokeWidth={1.5} />
                            Files and invoices
                        </Link>
                    </li>
                </ul>
            </Panel>
            <ToastDemo />
        </>
    );
}

// ---------- Admin ----------
const ADMIN_LABELS: Record<AdminSection, string> = { overview: 'Overview', concepts: 'Concepts', messages: 'Messages', brief: 'Brief', files: 'Files', audit: 'Audit' };

type QueueRow = { id: string; project: string; client: string; stage: string };
const QUEUE: QueueRow[] = [
    { id: 'p1', project: 'Northvale Coffee', client: 'Alex Morgan', stage: 'Concepts ready' },
    { id: 'p2', project: 'Atlas Joinery', client: 'Tom Reed', stage: 'Final files' },
];
const QUEUE_COLUMNS: Column<QueueRow>[] = [
    { key: 'project', header: 'Project', cell: (r) => <Link href={adminHref('overview')}>{r.project}</Link>, sortValue: (r) => r.project },
    { key: 'client', header: 'Client', cell: (r) => r.client },
    { key: 'stage', header: 'Stage', cell: (r) => r.stage },
];

function Admin({ section }: { section: string }) {
    const userMenu = { user: ADMIN, accountHref: adminHref('account'), onSignOut: noop };
    const areaHrefs = { queue: adminHref('queue'), health: adminHref('health') };
    if (!(section in ADMIN_LABELS)) {
        const health = section === 'health';
        return (
            <AdminShell area={health ? 'health' : 'queue'} areaHrefs={areaHrefs} userMenu={userMenu}>
                <Head title="UI catalogue: admin shell" />
                <Intro title={health ? 'Health' : 'Queue'} shell="admin" />
                {health ? (
                    <EmptyState title="All checks pass" icon={ScrollText}>
                        A sample Health page.
                    </EmptyState>
                ) : (
                    <DataTable caption="Needs action" columns={QUEUE_COLUMNS} rows={QUEUE} rowKey={(r) => r.id} />
                )}
            </AdminShell>
        );
    }
    const current = section as AdminSection;
    const hrefs = Object.fromEntries(Object.keys(ADMIN_LABELS).map((k) => [k, adminHref(k)])) as Record<AdminSection, string>;
    return (
        <AdminShell
            area="queue"
            areaHrefs={areaHrefs}
            userMenu={userMenu}
            project={{ name: PROJECT, current, hrefs, isNew: { concepts: true } }}
            properties={
                <PropertiesPanel
                    title="Properties"
                    properties={[
                        { key: 'client', label: 'Client', value: 'Alex Morgan' },
                        { key: 'package', label: 'Package', value: 'Professional' },
                        { key: 'order', label: 'Order reference', value: 'LF-2026-0142', mono: true },
                        { key: 'revisions', label: 'Revisions allowed', value: '2' },
                    ]}
                />
            }
        >
            <Head title="UI catalogue: admin shell" />
            <Intro title={`${PROJECT}: ${ADMIN_LABELS[current]}`} shell="admin" />
            {current === 'overview' ? (
                <>
                    <Panel title="Feedback waiting" actions={<Button variant="primary">Upload concept</Button>}>
                        <p className="text-base text-fg-2">2 revision requests on Concept 1.</p>
                    </Panel>
                    <ToastDemo />
                </>
            ) : (
                <SectionPlaceholder label={ADMIN_LABELS[current]} />
            )}
        </AdminShell>
    );
}

// ---------- Shared ----------
function Intro({ title, shell }: { title: string; shell: 'customer' | 'admin' }) {
    return (
        <div className="flex flex-col gap-1">
            <p className="text-sm text-fg-3">UI catalogue: {shell} shell · local and testing only</p>
            <h1 className="text-2xl font-semibold">{title}</h1>
        </div>
    );
}

function SectionPlaceholder({ label }: { label: string }) {
    return (
        <EmptyState title={`${label} (sample)`} icon={MessageSquare}>
            This section’s screen arrives with its story. The shell around it is what this page shows.
        </EmptyState>
    );
}

/** Proves the shell mounts ToastProvider: the page calls useToast() with no provider of its own. */
function ToastDemo(): ReactNode {
    const toast = useToast();
    return (
        <div>
            <Button variant="secondary" size="sm" onClick={() => toast.success('Saved. Your designer will see it next time they look.')}>
                Show a sample toast
            </Button>
        </div>
    );
}

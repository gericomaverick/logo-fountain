import { Head } from '@inertiajs/react';
import { FileText, Folder, Images, LayoutDashboard, MessageSquare } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { Button } from '@/Components/ui/Button';
import { Card, CardLink, Panel } from '@/Components/ui/Card';
import { Checkbox } from '@/Components/ui/Checkbox';
import { ConceptCard, ConceptGallery, type ConceptCardProps } from '@/Components/ui/ConceptCard';
import { ConceptViewer, type ConceptVersion } from '@/Components/ui/ConceptViewer';
import { DataTable, type Column } from '@/Components/ui/DataTable';
import { FileCard, FileCardPlaceholder } from '@/Components/ui/FileCard';
import { Link } from '@/Components/ui/Link';
import { PollingStatus } from '@/Components/ui/PollingStatus';
import { PropertiesPanel, type Property } from '@/Components/ui/PropertiesPanel';
import { Tabs, type TabItem } from '@/Components/ui/Tabs';
import { Thread, ThreadComposer, type ThreadMessage } from '@/Components/ui/Thread';
import { ThemeSwitcher } from '@/Components/ui/ThemeSwitcher';
import { UploadDropzone, type UploadStatus } from '@/Components/ui/UploadDropzone';
import { usePolling } from '@/hooks/usePolling';
import { countNewIds, newItemsAnnouncement, POLL_INTERVALS } from '@/lib/polling';

import concept1v1 from './fixtures/concept-1-v1.png';
import concept1v2 from './fixtures/concept-1-v2.png';
import concept2v1 from './fixtures/concept-2-v1.png';
import concept3v1 from './fixtures/concept-3-v1.png';

/**
 * /dev/ui/media: the story 1.8c catalogue (media and data components, Card/Panel, Tabs and
 * usePolling), local and testing only (routes/web.php). Every variant and state, both themes;
 * tests/browser/ui-media.spec.ts screenshots and drives it. Fixtures are local generated PNGs
 * (./fixtures/make-concepts.py) and a fixed "today", so the baselines are stable.
 * A catalogue, not a screen: it breaks "one primary per view" on purpose to show the variants.
 */
const TODAY = new Date('2026-11-20T12:00:00Z');
const ICON = { 'aria-hidden': true, size: 20, strokeWidth: 1.5 } as const;
const img = (imageKey: string, url: string) => ({ imageKey, url });

export default function UiMedia() {
    return (
        <>
            <Head title="UI catalogue: media and data" />
            <main className="mx-auto flex max-w-content flex-col gap-12 px-4 py-10 md:px-6 lg:px-10">
                <header className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex flex-col gap-2">
                        <p className="text-sm text-fg-3">Local and testing only</p>
                        <h1 className="text-2xl font-semibold">UI catalogue: media and data</h1>
                        <p className="max-w-prose text-fg-2">
                            Media and data components, Card/Panel, Tabs and polling (story 1.8c). Form and action primitives are in the{' '}
                            <Link href="/dev/ui">main catalogue</Link>.
                        </p>
                    </div>
                    <ThemeSwitcher />
                </header>
                <Cards />
                <TabsSection />
                <Concepts />
                <Viewer />
                <Files />
                <Uploads />
                <Threads />
                <Tables />
                <Properties />
                <Polling />
            </main>
        </>
    );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
    return (
        <section aria-labelledby={id} className="flex flex-col gap-6">
            <h2 id={id} className="border-b border-divider pb-2 text-lg font-semibold">
                {title}
            </h2>
            {children}
        </section>
    );
}

function Row({ label, children, stack = false }: { label: string; children: ReactNode; stack?: boolean }) {
    return (
        <div className="flex flex-col gap-3">
            <h3 className="text-sm font-medium text-fg-2">{label}</h3>
            <div className={stack ? 'flex flex-col gap-4' : 'grid grid-cols-1 gap-4 md:grid-cols-2'}>{children}</div>
        </div>
    );
}

// ---------- Card / Panel ----------
function Cards() {
    return (
        <Section id="cards" title="Card and Panel">
            <Row label="Card: default · interactive · selected">
                <Card>
                    <p className="font-semibold">Default</p>
                    <p className="text-fg-2">A surface for grouped content. No cards inside cards.</p>
                </Card>
                <Card variant="interactive">
                    <p className="font-semibold">
                        <CardLink href="#cards">Interactive</CardLink>
                    </p>
                    <p className="text-fg-2">The whole card is the link’s target; the link names it.</p>
                </Card>
                <Card variant="selected" aria-current="true">
                    <p className="font-semibold">Selected</p>
                    <p className="text-fg-2">Accent tone and border, plus aria-current.</p>
                </Card>
            </Row>
            <Row label="Panel: title, description, actions, footer · sunken">
                <Panel title="Allowances" level={3} description="What’s left on this project." actions={<Button size="sm">Buy more</Button>} footer={<Link href="#cards" variant="standalone">How allowances work</Link>}>
                    <p className="text-base">2 of 3 revisions left.</p>
                </Panel>
                <Panel title="Payment" level={3} tone="sunken">
                    <p className="text-base">Paid on 18 Nov 2026.</p>
                </Panel>
            </Row>
        </Section>
    );
}

// ---------- Tabs ----------
const TAB_ITEMS: TabItem[] = [
    { value: 'overview', label: 'Overview', icon: <LayoutDashboard {...ICON} />, content: <p>Your designer is working on your concepts.</p> },
    { value: 'concepts', label: 'Concepts', icon: <Images {...ICON} />, isNew: true, content: <p>Three concepts are ready.</p> },
    { value: 'messages', label: 'Messages', icon: <MessageSquare {...ICON} />, isNew: true, content: <p>One new message from Sam.</p> },
    { value: 'brief', label: 'Brief', icon: <FileText {...ICON} />, content: <p>Your brief, as sent on 12 Nov 2026.</p> },
    { value: 'files', label: 'Files', icon: <Folder {...ICON} />, disabled: true, content: <p>Final files.</p> },
];

function TabsSection() {
    return (
        <Section id="tabs" title="Tabs">
            <Row label="Top (desktop), with “new” dots; Files disabled" stack>
                <Tabs label="Project sections" items={TAB_ITEMS} defaultValue="overview" />
            </Row>
            <Row label="Bottom bar (phone)" stack>
                <div className="max-w-sm overflow-hidden rounded-lg border border-divider">
                    <Tabs label="Project sections (bottom bar)" placement="bottom" items={TAB_ITEMS.slice(0, 4).concat({ ...TAB_ITEMS[4]!, disabled: false })} defaultValue="concepts" />
                </div>
            </Row>
        </Section>
    );
}

// ---------- Concept cards ----------
const CONCEPTS: (ConceptCardProps & { id: string })[] = [
    { id: 'c1', number: 1, version: 2, image: img('a1', concept1v2), href: '#viewer', isNew: true },
    { id: 'c2', number: 2, version: 1, image: img('a2', concept2v1), href: '#viewer', status: 'approved' },
    { id: 'c3', number: 3, version: 1, image: img('a3', concept3v1), href: '#viewer', status: 'archived' },
    { id: 'c4', number: 4, version: 1, image: null, href: '#viewer', note: 'Preview unavailable is the partial state' },
];

function Concepts() {
    return (
        <Section id="concepts" title="Concept cards">
            <Row label="Gallery: new · approved · archived · preview unavailable (partial)" stack>
                <ConceptGallery label="Concepts" concepts={CONCEPTS} />
            </Row>
            <Row label="Selected · admin note" stack>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <ConceptCard number={1} version={2} image={img('a1', concept1v2)} href="#viewer" selected note="2 revision requests" />
                </div>
            </Row>
            <Row label="Loading" stack>
                <ConceptGallery label="Concepts" concepts={[]} loading />
            </Row>
            <Row label="Error (with retry) · empty">
                <ConceptGallery label="Concepts" concepts={[]} error="Check your connection, then try again." onRetry={() => {}} />
                <ConceptGallery label="Concepts" concepts={[]} />
            </Row>
        </Section>
    );
}

// ---------- Concept viewer ----------
function Viewer() {
    const [poll, setPoll] = useState(0);
    // A poll re-signs the URLs (new query string) but keeps the imageKeys (ADR-021).
    const versions: ConceptVersion[] = [
        { version: 1, image: img('k1', poll ? `${concept1v1}?sig=${poll}` : concept1v1), createdAt: '2026-11-12T10:00:00Z' },
        { version: 2, image: img('k2', poll ? `${concept1v2}?sig=${poll}` : concept1v2), createdAt: '2026-11-18T10:00:00Z' },
    ];
    return (
        <Section id="viewer" title="Concept viewer">
            <ConceptViewer number={1} versions={versions} headingLevel={3}>
                <div className="flex flex-wrap gap-3">
                    <Button variant="secondary" size="sm" onClick={() => setPoll((p) => p + 1)}>
                        Simulate a poll (re-signed URLs)
                    </Button>
                </div>
            </ConceptViewer>
            <Row label="One version, approved · no image">
                <ConceptViewer number={2} versions={[{ version: 1, image: img('k3', concept2v1), createdAt: '2026-11-18T10:00:00Z' }]} status="approved" headingLevel={3} />
                <ConceptViewer number={4} versions={[{ version: 1, image: null, createdAt: '2026-11-18T10:00:00Z' }]} headingLevel={3} />
            </Row>
        </Section>
    );
}

// ---------- File cards ----------
function Files() {
    const [downloading, setDownloading] = useState(false);
    return (
        <Section id="files" title="File cards">
            <Row label="Final ZIP: ready · downloading · not available yet" stack>
                <FileCard
                    kind="final"
                    name="northvale-coffee-final-files.zip"
                    sizeBytes={48_200_000}
                    date="2026-11-19T10:00:00Z"
                    downloading={downloading}
                    onDownload={() => {
                        setDownloading(true);
                        window.setTimeout(() => setDownloading(false), 1500);
                    }}
                />
                <FileCard kind="final" name="northvale-coffee-final-files-v2.zip" sizeBytes={51_000_000} date="2026-11-20T10:00:00Z" downloading primary={false} />
                <FileCard kind="final" name="Final files" date="2026-11-20T10:00:00Z" unavailableReason="Your designer is preparing your final files." primary={false} />
            </Row>
            <Row label="Invoice · receipt with a download error · loading" stack>
                <FileCard kind="invoice" name="INV-2026-0142.pdf" date="2026-11-12T10:00:00Z" detail="£495 · Paid" onDownload={() => {}} />
                <FileCard kind="receipt" name="RCPT-2026-0142.pdf" date="2026-11-12T10:00:00Z" detail="£95 · Paid" error="We couldn’t get that receipt. Try again in a moment." onDownload={() => {}} />
                <FileCardPlaceholder />
            </Row>
        </Section>
    );
}

// ---------- Upload dropzone ----------
function Uploads() {
    const [status, setStatus] = useState<UploadStatus>({ phase: 'idle' });
    return (
        <Section id="uploads" title="Upload dropzone">
            <Row label="Interactive: choose or drop a file (rejected files say the limit)" stack>
                <UploadDropzone kind="conceptImage" label="Concept image" status={status} onFile={(file) => setStatus({ phase: 'done', fileName: file.name })} />
            </Row>
            <Row label="Validating · uploading (progress)">
                <UploadDropzone kind="conceptImage" label="Concept image (validating)" status={{ phase: 'validating', fileName: 'northvale-logo.png' }} onFile={() => {}} />
                <UploadDropzone kind="finalZip" label="Final ZIP (uploading)" status={{ phase: 'uploading', fileName: 'final-files.zip', loaded: 21_400_000, total: 48_200_000 }} onFile={() => {}} onCancel={() => {}} />
            </Row>
            <Row label="Server error (code in plain language) · done">
                <UploadDropzone kind="conceptImage" label="Concept image (error)" status={{ phase: 'error', code: 'IMAGE_DIMENSIONS_TOO_LARGE', fileName: 'huge.png', size: 8_000_000 }} onFile={() => {}} />
                <UploadDropzone kind="conceptImage" label="Concept image (done)" status={{ phase: 'done', fileName: 'northvale-logo.png' }} onFile={() => {}} />
            </Row>
            <Row label="Final ZIP idle (95 MB, DV-13) · disabled with a reason">
                <UploadDropzone kind="finalZip" label="Final ZIP" onFile={() => {}} />
                <UploadDropzone kind="finalZip" label="Final ZIP (disabled)" onFile={() => {}} disabledReason="Approve a concept before uploading final files." />
            </Row>
        </Section>
    );
}

// ---------- Thread ----------
const SAM = { id: 'designer', email: 'sam@example.com', isAdmin: true, fullName: 'Sam Lee' };
const ALEX = { id: 'viewer', email: 'alex@example.com', fullName: 'Alex Morgan' };
const MESSAGES: ThreadMessage[] = [
    { id: 'm1', body: 'Hi Alex, thanks for the brief. I’ll start on concepts this week.', createdAt: '2026-11-17T09:12:00Z', sender: SAM },
    { id: 'm2', kind: 'system', body: 'Concept 1 is ready for review.', createdAt: '2026-11-19T10:00:00Z', sender: SAM },
    { id: 'm3', body: 'Love the ring idea!\nCould we try a warmer colour?', createdAt: '2026-11-19T10:30:00Z', sender: ALEX },
    { id: 'm4', body: 'Yes, I’ll send a version with gold today.', createdAt: '2026-11-20T08:05:00Z', sender: SAM },
    { id: 'm5', body: 'Great, thank you.', createdAt: '2026-11-20T08:10:00Z', sender: ALEX, delivery: 'failed' },
    { id: 'm6', body: 'Also, can the wordmark be bolder?', createdAt: '2026-11-20T08:11:00Z', sender: ALEX, delivery: 'sending' },
];

function Threads() {
    const [draft, setDraft] = useState('');
    const [sent, setSent] = useState<ThreadMessage[]>([]);
    return (
        <Section id="thread" title="Thread">
            <Row label="Day separators · you / designer / system · sending · failed, with composer" stack>
                <Card>
                    <Thread label="Messages with your designer" messages={[...MESSAGES, ...sent]} viewerId="viewer" today={TODAY} onResend={() => {}} />
                    <ThreadComposer
                        value={draft}
                        onChange={setDraft}
                        onSend={() => {
                            setSent((s) => [...s, { id: `local-${s.length}`, body: draft.trim(), createdAt: '2026-11-20T11:59:00Z', sender: ALEX }]);
                            setDraft('');
                        }}
                    />
                </Card>
            </Row>
            <Row label="Loading · error (messages kept) · empty">
                <Thread label="Messages (loading)" messages={[]} viewerId="viewer" today={TODAY} loading />
                <Thread label="Messages (error)" messages={MESSAGES.slice(0, 1)} viewerId="viewer" today={TODAY} error="Check your connection." onRetry={() => {}} />
                <Thread label="Messages (empty)" messages={[]} viewerId="viewer" today={TODAY} />
            </Row>
        </Section>
    );
}

// ---------- Data table ----------
type QueueRow = { id: string; brand: string; client: string; stage: string; updated: string; reasons: string[] };
const QUEUE: QueueRow[] = [
    { id: 'p1', brand: 'Northvale Coffee', client: 'Alex Morgan', stage: 'Concepts ready', updated: '2026-11-20', reasons: ['2 revision requests', 'New message'] },
    { id: 'p2', brand: 'Brightside Dental', client: 'Priya Shah', stage: 'Brief submitted', updated: '2026-11-18', reasons: ['Brief to review'] },
    { id: 'p3', brand: 'Atlas Joinery', client: 'Tom Reed', stage: 'Final files', updated: '2026-11-19', reasons: [] },
];
const QUEUE_COLUMNS: Column<QueueRow>[] = [
    { key: 'brand', header: 'Project', cell: (r) => <Link href={`#project-${r.id}`}>{r.brand}</Link>, sortValue: (r) => r.brand },
    { key: 'client', header: 'Client', cell: (r) => r.client, sortValue: (r) => r.client },
    { key: 'stage', header: 'Stage', cell: (r) => r.stage },
    { key: 'updated', header: 'Updated', cell: (r) => r.updated.split('-').reverse().join('/'), sortValue: (r) => r.updated, align: 'end' },
];

function Tables() {
    const [opened, setOpened] = useState<string | null>(null);
    return (
        <Section id="table" title="Data table">
            <Row label="Sortable · reason chips · keyboard rows (↑ ↓ Home End, Enter opens)" stack>
                <DataTable caption="Needs action" columns={QUEUE_COLUMNS} rows={QUEUE} rowKey={(r) => r.id} reasons={(r) => r.reasons} onOpen={(r) => setOpened(r.brand)} defaultSort={{ key: 'updated', direction: 'descending' }} />
                <p role="status" className="text-sm text-fg-2">
                    {opened ? `Opened ${opened}` : 'Press Enter on a row to open it.'}
                </p>
            </Row>
            <Row label="Partial · error (rows kept)" stack>
                <DataTable caption="In progress" columns={QUEUE_COLUMNS} rows={QUEUE.slice(1)} rowKey={(r) => r.id} partialNote="Showing 2 of 3 projects: 1 couldn’t load." />
                <DataTable caption="Done" columns={QUEUE_COLUMNS} rows={QUEUE.slice(2)} rowKey={(r) => r.id} error="Check your connection." onRetry={() => {}} />
            </Row>
            <Row label="Loading · empty">
                <DataTable caption="Loading projects" columns={QUEUE_COLUMNS} rows={[]} rowKey={(r) => r.id} loading />
                <DataTable caption="Nothing to do" columns={QUEUE_COLUMNS} rows={[]} rowKey={(r) => r.id} empty="Nothing needs action. New work appears here." />
            </Row>
        </Section>
    );
}

// ---------- Properties panel ----------
function Properties() {
    const [limit, setLimit] = useState('3');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const properties: Property[] = [
        { key: 'client', label: 'Client', value: 'Alex Morgan' },
        { key: 'package', label: 'Package', value: 'Professional' },
        { key: 'order', label: 'Order reference', value: 'LF-2026-0142', mono: true },
        {
            key: 'revisions',
            label: 'Revisions allowed',
            value: limit,
            edit: {
                value: limit,
                type: 'number',
                hint: 'Whole numbers only. Changes are logged.',
                saving,
                error,
                onSave: (v) => {
                    setSaving(true);
                    window.setTimeout(() => {
                        setSaving(false);
                        if (!/^\d+$/.test(v)) setError('Enter a whole number, like 3.');
                        else {
                            setError(null);
                            setLimit(v);
                        }
                    }, 800);
                },
            },
        },
        { key: 'phone', label: 'Phone', value: null },
    ];
    return (
        <Section id="properties" title="Properties panel">
            <Row label="Values · mono · inline edit · not set">
                <PropertiesPanel title="Properties" level={3} properties={properties} />
                <div className="flex flex-col gap-4">
                    <PropertiesPanel title="Order" level={3} properties={[]} loading />
                    <PropertiesPanel title="Client" level={3} properties={[]} error="Check your connection." onRetry={() => {}} />
                </div>
            </Row>
        </Section>
    );
}

// ---------- usePolling ----------
type Item = { id: string; text: string };

/** A fake server, so the hook runs for real: one request per interval, failures on demand. */
class FakeServer {
    private items: Item[] = [...FIRST_ITEMS];
    private failing = false;
    add() {
        const n = this.items.length + 1;
        this.items = [...this.items, { id: `e${n}`, text: `Event ${n}` }];
    }
    setFailing(on: boolean) {
        this.failing = on;
    }
    async list(): Promise<Item[]> {
        if (this.failing) throw new Error('offline');
        return this.items.slice();
    }
}
const FIRST_ITEMS: readonly Item[] = [{ id: 'e1', text: 'Concept 1 uploaded' }];

function Polling() {
    const [server] = useState(() => new FakeServer());
    const [failing, setFailing] = useState(false);
    const polling = usePolling<Item[]>({
        interval: POLL_INTERVALS.adminProject,
        initialData: [...FIRST_ITEMS],
        fetch: () => server.list(),
        announce: (prev, next) => newItemsAnnouncement(countNewIds(prev, next), 'event'),
    });
    const items = polling.data ?? [];
    return (
        <Section id="polling" title="usePolling">
            <p className="max-w-prose text-fg-2">
                Polls every 2 s (the admin interval). After 3 failures in a row a quiet “Reconnecting…” appears and polling backs off; it pauses while the tab is hidden. New events are announced politely and added at
                the end, so nothing you’re reading moves.
            </p>
            <div className="flex flex-wrap items-start gap-4">
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => server.add()}
                >
                    Add an event on the server
                </Button>
                <Checkbox
                    label="Make requests fail"
                    checked={failing}
                    onChange={(e) => {
                        server.setFailing(e.currentTarget.checked);
                        setFailing(e.currentTarget.checked);
                    }}
                />
            </div>
            <Panel title="Activity" level={3}>
                <PollingStatus reconnecting={polling.reconnecting} announcement={polling.announcement} refresh={polling.refresh} />
                <ol aria-label="Activity" className="flex flex-col divide-y divide-divider">
                    {items.map((item) => (
                        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- catalogue only: lets the spec prove focus stays put when items are appended
                        <li key={item.id} tabIndex={0} className="rounded-sm py-2 text-base">
                            {item.text}
                        </li>
                    ))}
                </ol>
            </Panel>
        </Section>
    );
}

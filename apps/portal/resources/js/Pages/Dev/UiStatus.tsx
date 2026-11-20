import { Head } from '@inertiajs/react';
import { FileArchive, Inbox, MessageSquare } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { AllowanceMeter } from '@/Components/ui/AllowanceMeter';
import { Button } from '@/Components/ui/Button';
import { ChoiceChips } from '@/Components/ui/ChoiceChips';
import { EmptyState } from '@/Components/ui/EmptyState';
import { Link } from '@/Components/ui/Link';
import { Skeleton } from '@/Components/ui/Skeleton';
import { StageTracker } from '@/Components/ui/StageTracker';
import { StatusPill } from '@/Components/ui/StatusPill';
import { ThemeSwitcher } from '@/Components/ui/ThemeSwitcher';
import { TurnBanner } from '@/Components/ui/TurnBanner';
import { bannerCopy, buildTimeline, CELEBRATION_COPY, CELEBRATIONS, PROJECT_STATES, turnFor, type Celebration, type ProjectState, type Turn } from '@/lib/status';

/**
 * /dev/ui/status: the status components of story 1.8b (UX §2.5, §11), every variant and state.
 * Local and testing only (routes/web.php). Its own page so its L7 baselines
 * (tests/browser/ui-status.spec.ts) don't touch /dev/ui's. A catalogue, not a screen: it breaks
 * "one primary per view" on purpose. Exactly one celebration banner is shown at a time, so the
 * page keeps UX §8.2's one display-font line per screen.
 */
const TURN_HEADINGS: Record<Turn, string> = {
    'your-turn': 'Your turn',
    'designers-turn': 'Designer’s turn',
    done: 'Done',
    paused: 'Paused',
    closed: 'Closed',
};

/** Fixed dates (UK), so the baselines never change with the clock. */
const T: Partial<Record<ProjectState, string>> = {
    AWAITING_BRIEF: '2026-11-02T09:15:00Z',
    BRIEF_SUBMITTED: '2026-11-03T14:40:00Z',
    IN_DESIGN: '2026-11-04T10:00:00Z',
    CONCEPTS_READY: '2026-11-10T16:20:00Z',
    REVISIONS_IN_PROGRESS: '2026-11-12T11:05:00Z',
    AWAITING_APPROVAL: '2026-11-16T09:30:00Z',
    FINAL_FILES_READY: '2026-11-18T15:45:00Z',
    DELIVERED: '2026-11-19T08:10:00Z',
};
const upTo = (state: ProjectState) => Object.fromEntries(Object.entries(T).filter(([s]) => PROJECT_STATES.indexOf(s as ProjectState) <= PROJECT_STATES.indexOf(state)));

const TRACKERS: Array<{ name: string; state: string; timestamps: Partial<Record<ProjectState, string>>; approved?: boolean }> = [
    { name: 'Start: awaiting brief', state: 'AWAITING_BRIEF', timestamps: upTo('AWAITING_BRIEF') },
    { name: 'Middle: revisions in progress', state: 'REVISIONS_IN_PROGRESS', timestamps: upTo('REVISIONS_IN_PROGRESS') },
    { name: 'Approved, final files being prepared', state: 'AWAITING_APPROVAL', timestamps: upTo('AWAITING_APPROVAL'), approved: true },
    { name: 'Delivered (all done)', state: 'DELIVERED', timestamps: T },
    { name: 'Terminal: on hold', state: 'ON_HOLD', timestamps: { ...upTo('IN_DESIGN'), ON_HOLD: '2026-11-06T12:00:00Z' } },
    { name: 'Terminal: cancelled', state: 'CANCELLED', timestamps: { ...upTo('BRIEF_SUBMITTED'), CANCELLED: '2026-11-05T17:30:00Z' } },
    { name: 'Terminal: refunded', state: 'REFUNDED', timestamps: { ...upTo('CONCEPTS_READY'), REFUNDED: '2026-11-11T10:00:00Z' } },
];

const ACTION: Partial<Record<ProjectState, ReactNode>> = {
    AWAITING_BRIEF: <Button variant="primary" width="phone">{bannerCopy('AWAITING_BRIEF').actionLabel}</Button>,
    CONCEPTS_READY: <Button variant="primary" width="phone">{bannerCopy('CONCEPTS_READY').actionLabel}</Button>,
    FINAL_FILES_READY: <Button variant="primary" width="phone">{bannerCopy('FINAL_FILES_READY').actionLabel}</Button>,
    ON_HOLD: (
        <Link href="#messages" variant="standalone">
            {bannerCopy('ON_HOLD').actionLabel}
        </Link>
    ),
};

export default function UiStatus() {
    return (
        <>
            <Head title="UI catalogue: status" />
            <main className="mx-auto flex max-w-content flex-col gap-12 px-4 py-10 md:px-6 lg:px-10">
                <header className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex flex-col gap-2">
                        <p className="text-sm text-fg-3">Local and testing only</p>
                        <h1 className="text-2xl font-semibold">UI catalogue: status</h1>
                        <p className="max-w-prose text-fg-2">Status components (story 1.8b), every variant and state, for all 11 project states.</p>
                    </div>
                    <ThemeSwitcher />
                </header>
                <Banners />
                <Celebrations />
                <Pills />
                <Trackers />
                <Allowances />
                <Empties />
                <Skeletons />
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

function Group({ label, children, className = 'flex flex-col gap-4' }: { label: string; children: ReactNode; className?: string }) {
    return (
        <div className="flex flex-col gap-3">
            <h3 className="text-sm font-medium text-fg-2">{label}</h3>
            <div className={className}>{children}</div>
        </div>
    );
}

const statesOf = (turn: Turn) => PROJECT_STATES.filter((s) => turnFor(s) === turn);

function Banners() {
    // A live demo for the polite announcement when the turn changes after load.
    const [demo, setDemo] = useState<ProjectState>('IN_DESIGN');
    return (
        <Section id="turn-banners" title="Turn banner">
            {(Object.keys(TURN_HEADINGS) as Turn[]).map((turn) => (
                <Group key={turn} label={TURN_HEADINGS[turn]}>
                    {statesOf(turn).map((state) => (
                        <TurnBanner key={state} state={state} action={ACTION[state]} />
                    ))}
                </Group>
            ))}
            <Group label="Turn changes while open (announced politely)">
                <div className="flex flex-col gap-3" data-demo="turn-change">
                    <TurnBanner state={demo} action={ACTION[demo]} />
                    <div>
                        <Button variant="secondary" size="sm" onClick={() => setDemo(demo === 'IN_DESIGN' ? 'CONCEPTS_READY' : 'IN_DESIGN')}>
                            Change the demo turn
                        </Button>
                    </div>
                </div>
            </Group>
        </Section>
    );
}

function Celebrations() {
    const [kind, setKind] = useState<Celebration>('first-concepts');
    const state = CELEBRATION_COPY[kind].state;
    return (
        <Section id="celebration" title="Turn banner: celebration">
            <ChoiceChips
                legend="Celebration moment"
                hint="One at a time: a screen has at most one display line (UX §8.2)."
                options={CELEBRATIONS.map((c) => ({ value: c, label: CELEBRATION_COPY[c].title }))}
                value={kind}
                onChange={(v) => setKind(v as Celebration)}
                size="sm"
            />
            <TurnBanner state={state} celebration={kind} action={ACTION[state]} />
        </Section>
    );
}

function Pills() {
    return (
        <Section id="status-pills" title="Status pill">
            {(Object.keys(TURN_HEADINGS) as Turn[]).map((turn) => (
                <Group key={turn} label={TURN_HEADINGS[turn]} className="flex flex-col gap-2">
                    {statesOf(turn).map((state) => (
                        <div key={state} data-state={state} className="flex flex-wrap items-center gap-3">
                            <StatusPill state={state} />
                            <span className="font-mono text-sm text-fg-3">{state}</span>
                        </div>
                    ))}
                </Group>
            ))}
        </Section>
    );
}

function Trackers() {
    return (
        <Section id="stage-trackers" title="Stage tracker">
            {TRACKERS.map((t) => (
                <Group key={t.name} label={`Horizontal: ${t.name}`}>
                    {/* Horizontal is the desktop form; at phone width the catalogue scrolls it sideways. */}
                    {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region must be focusable (axe scrollable-region-focusable) */}
                    <div tabIndex={0} role="region" aria-label={`${t.name}, horizontal`} className="overflow-x-auto rounded-md">
                        <div className="min-w-[48rem]">
                            <StageTracker orientation="horizontal" timeline={buildTimeline(t.state, t.timestamps, { hasApprovedMilestone: t.approved })} label={`Progress: ${t.name}`} />
                        </div>
                    </div>
                </Group>
            ))}
            <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
                {[TRACKERS[1], TRACKERS[3], TRACKERS[4]].map((t) =>
                    t ? (
                        <Group key={t.name} label={`Vertical: ${t.name}`}>
                            <StageTracker orientation="vertical" timeline={buildTimeline(t.state, t.timestamps, { hasApprovedMilestone: t.approved })} label={`Progress (vertical): ${t.name}`} />
                        </Group>
                    ) : null,
                )}
            </div>
            <Group label="Responsive (vertical on phones, horizontal from md)">
                <StageTracker timeline={buildTimeline('CONCEPTS_READY', upTo('CONCEPTS_READY'))} label="Progress (responsive)" />
            </Group>
        </Section>
    );
}

const CONCEPTS = { one: 'concept', many: 'concepts' };
const REVISIONS = { one: 'revision', many: 'revisions' };

function Allowances() {
    return (
        <Section id="allowance-meters" title="Allowance meter">
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
                <AllowanceMeter label="Concepts: all delivered" noun={CONCEPTS} usage={{ limit: 2, consumed: 2, reserved: 0 }} />
                <AllowanceMeter label="Revisions: 1 in progress" noun={REVISIONS} usage={{ limit: 2, consumed: 0, reserved: 1 }} />
                <AllowanceMeter label="Revisions: none left" noun={REVISIONS} usage={{ limit: 2, consumed: 1, reserved: 1 }} />
                <AllowanceMeter label="Revisions: none used yet" noun={REVISIONS} usage={{ limit: 3, consumed: 0, reserved: 0 }} />
                <AllowanceMeter label="Concepts: unlimited" noun={CONCEPTS} usage={{ limit: 0, consumed: 3, reserved: 0, unlimited: true }} />
                <AllowanceMeter label="Revisions: unlimited, 1 in progress" noun={REVISIONS} usage={{ limit: 0, consumed: 4, reserved: 1, unlimited: true }} />
                <AllowanceMeter label="Revisions: large allowance (bar)" noun={REVISIONS} usage={{ limit: 20, consumed: 7, reserved: 2 }} />
                <AllowanceMeter label="Revisions: limit lowered below usage" noun={REVISIONS} usage={{ limit: 1, consumed: 2, reserved: 0 }} />
            </div>
        </Section>
    );
}

function Empties() {
    return (
        <Section id="empty-states" title="Empty state">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <EmptyState as="h3" icon={Inbox} title="No concepts yet">
                    Your concepts will appear here once your designer shares them. We’ll email you when they’re ready.
                </EmptyState>
                <EmptyState as="h3" icon={MessageSquare} title="No messages yet" action={<Button variant="secondary">Write to your designer</Button>}>
                    Messages between you and your designer will appear here.
                </EmptyState>
                <EmptyState as="h3" icon={FileArchive} title="Your final files aren’t ready yet">
                    They’ll appear here after you approve a concept and your designer prepares them.
                </EmptyState>
                <EmptyState as="h3" title="Nothing needs you right now">
                    New briefs, feedback and messages will appear here.
                </EmptyState>
            </div>
        </Section>
    );
}

function Skeletons() {
    return (
        <Section id="skeletons" title="Skeleton (first load only)">
            <Group label="List">
                <Skeleton variant="list" what="messages" count={3} />
            </Group>
            <Group label="Card">
                <Skeleton variant="card" what="concepts" count={3} />
            </Group>
            <Group label="Image">
                <Skeleton variant="image" what="concept images" count={3} />
            </Group>
        </Section>
    );
}

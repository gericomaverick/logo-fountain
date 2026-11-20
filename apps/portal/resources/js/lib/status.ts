// Pure logic behind the status components (story 1.8b, UX §2.5, §11). No imports, so tests/js can
// run it with node:test (Node 24 type stripping) without a bundler.
//
// The project states are exactly apps/web/src/lib/project-state-machine.ts PROJECT_STATES (no
// others exist). Each maps to exactly one turn (UX §2.5); the stage tracker's steps are Next's
// buildTimeline(), ported value for value so the tracker shows the same steps the Next timeline does.

export const PROJECT_STATES = [
    'AWAITING_BRIEF',
    'BRIEF_SUBMITTED',
    'IN_DESIGN',
    'CONCEPTS_READY',
    'REVISIONS_IN_PROGRESS',
    'AWAITING_APPROVAL',
    'FINAL_FILES_READY',
    'DELIVERED',
    'ON_HOLD',
    'CANCELLED',
    'REFUNDED',
] as const;

export type ProjectState = (typeof PROJECT_STATES)[number];

export function isProjectState(value: unknown): value is ProjectState {
    return typeof value === 'string' && (PROJECT_STATES as readonly string[]).includes(value);
}

// ---------- Turns (UX §2.5) ----------
export const TURNS = ['your-turn', 'designers-turn', 'done', 'paused', 'closed'] as const;
export type Turn = (typeof TURNS)[number];

/**
 * UX §2.5. The customer-action states follow Next's `customerActionFor` (AWAITING_BRIEF,
 * CONCEPTS_READY, FINAL_FILES_READY). AWAITING_APPROVAL is the designer's turn ("Approved, final
 * files being prepared"). An unknown state is the designer's turn: never ask the customer to act
 * on something we can't name.
 */
const TURN_BY_STATE: Record<ProjectState, Turn> = {
    AWAITING_BRIEF: 'your-turn',
    BRIEF_SUBMITTED: 'designers-turn',
    IN_DESIGN: 'designers-turn',
    CONCEPTS_READY: 'your-turn',
    REVISIONS_IN_PROGRESS: 'designers-turn',
    AWAITING_APPROVAL: 'designers-turn',
    FINAL_FILES_READY: 'your-turn',
    DELIVERED: 'done',
    ON_HOLD: 'paused',
    CANCELLED: 'closed',
    REFUNDED: 'closed',
};

export function turnFor(state: string): Turn {
    return isProjectState(state) ? TURN_BY_STATE[state] : 'designers-turn';
}

/** The Status pill text (UX §11: text plus an icon, never colour alone). Closed says which. */
export function pillLabel(state: string): string {
    if (state === 'CANCELLED') return 'Cancelled';
    if (state === 'REFUNDED') return 'Refunded';
    return { 'your-turn': 'Your turn', 'designers-turn': 'With your designer', done: 'Complete', paused: 'Paused', closed: 'Closed' }[turnFor(state)];
}

// ---------- Turn banner copy (UX §2.5, §7, §12 Copy) ----------
export type BannerCopy = {
    title: string;
    body: string;
    /** The one primary action's label, for the your-turn states (verb-first, §12). */
    actionLabel?: string;
};

/**
 * Plain British English, second person, no internal state names (§12). The designer's-turn lines
 * start "Nothing needed from you" (§2.5). Turnaround times ("usually within N working days") are an
 * open owner item (UX §15.2), so none are promised here yet.
 */
export const BANNER_COPY: Record<ProjectState, BannerCopy> = {
    AWAITING_BRIEF: {
        title: 'Your turn: tell us about your brand',
        body: 'It takes about 10 minutes. Your designer starts as soon as your brief is in.',
        actionLabel: 'Start your brief',
    },
    BRIEF_SUBMITTED: {
        title: 'Your designer has your brief',
        body: 'Nothing needed from you. Your designer is reading your brief and will start on your concepts next.',
    },
    IN_DESIGN: {
        title: 'Your concepts are being designed',
        body: 'Nothing needed from you. Your designer is working on your concepts. We’ll email you when they’re ready.',
    },
    CONCEPTS_READY: {
        title: 'Your turn: review your concepts',
        body: 'Take a look and tell your designer what you think. Comments are free; a revision uses one of your allowance.',
        actionLabel: 'Review concepts',
    },
    REVISIONS_IN_PROGRESS: {
        title: 'Your designer is working on your feedback',
        body: 'Nothing needed from you. We’ll email you when the revised concept is ready.',
    },
    AWAITING_APPROVAL: {
        title: 'Approved, final files being prepared',
        body: 'Nothing needed from you. Your designer is preparing your final files. We’ll email you when they’re ready.',
    },
    FINAL_FILES_READY: {
        title: 'Your turn: your final files are ready',
        body: 'Download them now. They stay in Files, so you can come back for them any time.',
        actionLabel: 'Download ZIP',
    },
    DELIVERED: {
        title: 'Complete',
        body: 'Your files are always here, in Files.',
    },
    ON_HOLD: {
        title: 'Paused',
        body: 'Your project is paused. Check your messages to see what your designer needs.',
        actionLabel: 'Check messages',
    },
    CANCELLED: {
        title: 'Cancelled',
        body: 'This project was cancelled. Your messages and invoices are still here.',
    },
    REFUNDED: {
        title: 'Refunded',
        body: 'This project was refunded. Your messages and invoices are still here.',
    },
};

export function bannerCopy(state: string): BannerCopy {
    // An unknown state reads as the designer's turn (turnFor), with nothing to name.
    return isProjectState(state) ? BANNER_COPY[state] : { title: 'Your designer is on it', body: 'Nothing needed from you right now.' };
}

/** The three celebration moments (UX §7, §8.2): their headline is the one display-font line on Overview. */
export const CELEBRATIONS = ['first-concepts', 'approved', 'final-files'] as const;
export type Celebration = (typeof CELEBRATIONS)[number];

export const CELEBRATION_COPY: Record<Celebration, { state: ProjectState; title: string }> = {
    'first-concepts': { state: 'CONCEPTS_READY', title: 'Your first concepts are here' },
    approved: { state: 'AWAITING_APPROVAL', title: 'You’ve chosen your logo' },
    'final-files': { state: 'FINAL_FILES_READY', title: 'Your final files are ready' },
};

// ---------- Stage tracker (Next buildTimeline, ported) ----------
export type TimelineState = ProjectState | 'APPROVED';

/** One item of Next's `timeline[]` (the snapshot JSON shape, so server props can be passed straight in). */
export type TimelineItem = {
    state: TimelineState;
    label: string;
    completed: boolean;
    current: boolean;
    timestamp?: string | undefined;
};

const FLOW_STEPS: Array<{ state: TimelineState; label: string; sourceState?: ProjectState }> = [
    { state: 'AWAITING_BRIEF', label: 'Awaiting brief' },
    { state: 'BRIEF_SUBMITTED', label: 'Brief submitted' },
    { state: 'IN_DESIGN', label: 'In design' },
    { state: 'CONCEPTS_READY', label: 'Concepts ready' },
    { state: 'REVISIONS_IN_PROGRESS', label: 'Revisions in progress' },
    { state: 'AWAITING_APPROVAL', label: 'Awaiting approval' },
    { state: 'APPROVED', label: 'Approved', sourceState: 'AWAITING_APPROVAL' },
    { state: 'FINAL_FILES_READY', label: 'Final files ready' },
    { state: 'DELIVERED', label: 'Delivered' },
];

export const TERMINAL_LABELS: Record<'ON_HOLD' | 'CANCELLED' | 'REFUNDED', string> = {
    ON_HOLD: 'On hold',
    CANCELLED: 'Cancelled',
    REFUNDED: 'Refunded',
};

const FLOW_ORDER: ProjectState[] = ['AWAITING_BRIEF', 'BRIEF_SUBMITTED', 'IN_DESIGN', 'CONCEPTS_READY', 'REVISIONS_IN_PROGRESS', 'AWAITING_APPROVAL', 'FINAL_FILES_READY', 'DELIVERED'];

/** apps/web/src/lib/project-state-machine.ts buildTimeline(), same inputs and output. */
export function buildTimeline(
    currentState: string,
    timestamps: Partial<Record<ProjectState, string>> = {},
    options?: { hasApprovedMilestone?: boolean },
): TimelineItem[] {
    const isExplicitApprovedState = currentState === 'APPROVED';
    const current: ProjectState = isProjectState(currentState) ? currentState : isExplicitApprovedState ? 'AWAITING_APPROVAL' : 'AWAITING_BRIEF';
    const currentIdx = FLOW_ORDER.indexOf(current);

    if (currentState === 'ON_HOLD' || currentState === 'CANCELLED' || currentState === 'REFUNDED') {
        return [
            ...FLOW_STEPS.map((step) => ({
                state: step.state,
                label: step.label,
                completed: false,
                current: false,
                timestamp: step.sourceState ? timestamps[step.sourceState] : isProjectState(step.state) ? timestamps[step.state] : undefined,
            })),
            { state: currentState, label: TERMINAL_LABELS[currentState], completed: false, current: true, timestamp: timestamps[currentState] },
        ];
    }

    const approvedMilestoneReached = Boolean(options?.hasApprovedMilestone || isExplicitApprovedState || current === 'FINAL_FILES_READY' || current === 'DELIVERED');
    const approvedIsCurrent = isExplicitApprovedState || (current === 'AWAITING_APPROVAL' && approvedMilestoneReached);

    return FLOW_STEPS.map((step) => {
        if (step.state === 'APPROVED') {
            return { state: step.state, label: step.label, completed: approvedMilestoneReached && !approvedIsCurrent, current: approvedIsCurrent, timestamp: timestamps.AWAITING_APPROVAL };
        }
        const stepIdx = FLOW_ORDER.indexOf(step.state as ProjectState);
        return {
            state: step.state,
            label: step.label,
            completed: stepIdx < currentIdx || (step.state === 'AWAITING_APPROVAL' && approvedIsCurrent),
            current: stepIdx === currentIdx && !approvedIsCurrent,
            timestamp: timestamps[step.state as ProjectState],
        };
    });
}

export type StepStatus = 'done' | 'current' | 'upcoming';
export type TrackerStep = { key: string; label: string; status: StepStatus; timestamp?: string | undefined };
export type TerminalKind = 'paused' | 'cancelled' | 'refunded';
export type TrackerModel = {
    steps: TrackerStep[];
    /** Set when the project is on hold, cancelled or refunded: the flow is stopped at this marker. */
    terminal: { kind: TerminalKind; label: string; timestamp?: string | undefined } | null;
};

const TERMINAL_KIND: Record<string, TerminalKind> = { ON_HOLD: 'paused', CANCELLED: 'cancelled', REFUNDED: 'refunded' };

/**
 * Turns a timeline (Next's shape) into what the tracker draws. In a terminal state Next marks
 * every flow step "not completed" and appends the terminal item as current; the tracker keeps that
 * (no step is claimed done or upcoming: they're shown muted, with their timestamps) and draws the
 * terminal item as the stop marker.
 */
export function trackerModel(items: readonly TimelineItem[]): TrackerModel {
    const last = items[items.length - 1];
    const kind = last ? TERMINAL_KIND[last.state] : undefined;
    if (last && kind) {
        return {
            steps: items.slice(0, -1).map((i) => ({ key: i.state, label: i.label, status: 'upcoming', timestamp: i.timestamp })),
            terminal: { kind, label: last.label, timestamp: last.timestamp },
        };
    }
    return {
        steps: items.map((i) => ({ key: i.state, label: i.label, status: i.current ? 'current' : i.completed ? 'done' : 'upcoming', timestamp: i.timestamp })),
        terminal: null,
    };
}

/** Hidden text read after each step's label, so status isn't conveyed by the glyph alone. */
export function stepStatusText(status: StepStatus, stopped: boolean): string {
    if (stopped) return '';
    return { done: 'Done', current: 'Current step', upcoming: 'Not started yet' }[status];
}

/** UX §12 dates: "18 Nov 2026", in UK time (the business's zone), or null for a missing/bad value. */
export function formatDate(iso: string | undefined | null): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' }).format(d);
}

// ---------- Allowance meter (UX §7, §11) ----------
/** Next's `entitlementUsage.{concepts,revisions}` shape (apps/web/src/lib/entitlements.ts). */
export type EntitlementUsage = {
    limit: number;
    consumed: number;
    reserved?: number | undefined;
    remaining?: number | undefined;
    unlimited?: boolean | undefined;
    configured?: boolean | undefined;
};

export type Segment = 'used' | 'in-progress' | 'left';

export type AllowanceView = {
    unlimited: boolean;
    limit: number;
    used: number;
    inProgress: number;
    left: number;
    /** Used plus in progress beyond the limit (an admin can set a limit below usage; nothing stops it). */
    over: number;
    /** One segment per slot when the limit is small enough to count; otherwise a proportional bar. */
    segments: Segment[] | null;
    /** Proportions for the bar form (0–1 each, summing to 1 when limit > 0). */
    bar: { used: number; inProgress: number; left: number } | null;
    /** The big number, e.g. "1 left", "None left", "Unlimited". */
    headline: string;
    /** The legend, also the accessible summary, e.g. "1 used · 1 in progress · 0 left". */
    legend: string;
};

/** Above this many slots a segmented bar stops being countable at a glance (Next used 12 too). */
export const MAX_SEGMENTS = 12;

const n = (v: number | undefined | null) => (Number.isFinite(v) ? Math.max(Math.floor(v as number), 0) : 0);

/**
 * Same maths as Next's resolveUsage/computeEntitlementUsage: everything clamps at 0;
 * left = max(limit − used − in progress, 0). In progress is "reserved" (a revision requested but not
 * yet delivered); used is "consumed". Over-limit usage fills every slot and is counted separately.
 */
export function allowanceView(usage: EntitlementUsage | undefined | null, noun: { one: string; many: string } = { one: 'item', many: 'items' }): AllowanceView {
    const used = n(usage?.consumed);
    const inProgress = n(usage?.reserved);
    const unlimited = Boolean(usage?.unlimited);
    const limit = unlimited ? 0 : n(usage?.limit);
    const parts = [`${used} used`, ...(inProgress > 0 || !unlimited ? [`${inProgress} in progress`] : [])];

    if (unlimited) {
        return { unlimited, limit, used, inProgress, left: 0, over: 0, segments: null, bar: null, headline: 'Unlimited', legend: `Unlimited ${noun.many} · ${parts.join(' · ')}` };
    }

    const left = Math.max(limit - used - inProgress, 0);
    const over = Math.max(used + inProgress - limit, 0);
    // Slots fill used first, then in progress, so an over-limit project shows every slot taken.
    const usedSlots = Math.min(used, limit);
    const progressSlots = Math.min(inProgress, limit - usedSlots);
    const segments: Segment[] | null =
        limit > 0 && limit <= MAX_SEGMENTS
            ? Array.from({ length: limit }, (_, i): Segment => (i < usedSlots ? 'used' : i < usedSlots + progressSlots ? 'in-progress' : 'left'))
            : null;
    const bar = limit > MAX_SEGMENTS ? { used: usedSlots / limit, inProgress: progressSlots / limit, left: (limit - usedSlots - progressSlots) / limit } : null;
    const headline = left > 0 ? `${left} left` : 'None left';
    const legend = [`${left} of ${limit} ${limit === 1 ? noun.one : noun.many} left`, ...parts, ...(over > 0 ? [`${over} over the limit`] : [])].join(' · ');
    return { unlimited, limit, used, inProgress, left, over, segments, bar, headline, legend };
}

// ---------- Skeleton (UX §11: list · card · image) ----------
export const SKELETON_VARIANTS = ['list', 'card', 'image'] as const;
export type SkeletonVariant = (typeof SKELETON_VARIANTS)[number];

/** List rows to draw (at least 1, at most 8, so a skeleton never claims more than a screen). */
export function skeletonRows(count: number | undefined): number {
    return Math.min(Math.max(Math.floor(count ?? 3), 1), 8);
}

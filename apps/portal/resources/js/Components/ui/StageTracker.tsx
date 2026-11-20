import { Circle, CircleCheck, CircleDot, CirclePause, CircleSlash2 } from 'lucide-react';

import { formatDate, stepStatusText, trackerModel, type TerminalKind, type TimelineItem, type TrackerStep } from '@/lib/status';
import { cx } from '@/lib/ui';

/**
 * UX §11 Stage tracker: horizontal (desktop) · vertical (phone); done / current / upcoming;
 * terminal states (on hold, cancelled, refunded).
 * - Input is the timeline in Next's snapshot shape (`buildTimeline` in lib/status.ts, or the
 *   server's `timeline[]`), so the steps are exactly the ones Next shows.
 * - Each step's status is a glyph plus hidden text ("Done", "Current step", "Not started yet"),
 *   and the current one has aria-current="step": never colour alone (§8.1).
 * - Timestamps are shown as text under the step (not on hover or tap only): no content relies on
 *   hover (§13), and there's no tooltip primitive yet.
 * - In a terminal state Next marks no step done; the tracker shows the steps muted, with their
 *   dates, and ends at the stop marker.
 * - `orientation="responsive"` (default) is vertical below md and horizontal from md.
 */
type Orientation = 'horizontal' | 'vertical' | 'responsive';

type Props = {
    timeline: readonly TimelineItem[];
    orientation?: Orientation;
    /** The list's accessible name. */
    label?: string;
};

// Literal class strings per orientation (Tailwind only sees whole class names in source).
const LAYOUT: Record<Orientation, { list: string; item: string; rail: string; line: string; text: string }> = {
    horizontal: {
        list: 'flex flex-row',
        item: 'flex min-w-0 flex-1 flex-col gap-2',
        rail: 'flex flex-row items-center',
        line: 'mx-1 h-px flex-1',
        text: 'pr-2',
    },
    vertical: {
        list: 'flex flex-col',
        item: 'flex flex-row gap-3',
        rail: 'flex flex-col items-center',
        line: 'my-1 w-px min-h-4 flex-1',
        text: 'pb-4',
    },
    responsive: {
        list: 'flex flex-col md:flex-row',
        item: 'flex flex-row gap-3 md:min-w-0 md:flex-1 md:flex-col md:gap-2',
        rail: 'flex flex-col items-center md:flex-row',
        line: 'my-1 w-px min-h-4 flex-1 md:mx-1 md:my-0 md:h-px md:min-h-0 md:w-auto',
        text: 'pb-4 md:pr-2 md:pb-0',
    },
};

const ICON = { 'aria-hidden': true, size: 20, strokeWidth: 1.5, className: 'shrink-0' } as const;

export function StageTracker({ timeline, orientation = 'responsive', label = 'Project progress' }: Props) {
    const { steps, terminal } = trackerModel(timeline);
    const stopped = terminal !== null;
    const L = LAYOUT[orientation];
    const total = steps.length + (terminal ? 1 : 0);

    return (
        <ol aria-label={label} data-orientation={orientation} className={L.list}>
            {steps.map((step, i) => (
                <li key={step.key} aria-current={step.status === 'current' ? 'step' : undefined} data-status={stopped ? 'stopped' : step.status} className={L.item}>
                    <div className={L.rail}>
                        <StepGlyph step={step} stopped={stopped} />
                        {i < total - 1 ? <span aria-hidden="true" className={cx(L.line, !stopped && step.status === 'done' ? 'bg-fg-3' : 'bg-divider')} /> : null}
                    </div>
                    <StepText label={step.label} timestamp={step.timestamp} status={stepStatusText(step.status, stopped)} strong={step.status === 'current'} muted={stopped || step.status === 'upcoming'} className={L.text} />
                </li>
            ))}
            {terminal ? (
                <li aria-current="step" data-status="terminal" data-terminal={terminal.kind} className={L.item}>
                    <div className={L.rail}>
                        <TerminalGlyph kind={terminal.kind} />
                    </div>
                    <StepText label={terminal.label} timestamp={terminal.timestamp} status="Current status" strong muted={false} className={L.text} />
                </li>
            ) : null}
        </ol>
    );
}

function StepGlyph({ step, stopped }: { step: TrackerStep; stopped: boolean }) {
    if (stopped || step.status === 'upcoming') return <Circle {...ICON} className={cx(ICON.className, 'text-border')} />;
    if (step.status === 'done') return <CircleCheck {...ICON} className={cx(ICON.className, 'text-fg-2')} />;
    return <CircleDot {...ICON} className={cx(ICON.className, 'text-accent')} />;
}

function TerminalGlyph({ kind }: { kind: TerminalKind }) {
    if (kind === 'paused') return <CirclePause {...ICON} className={cx(ICON.className, 'text-warning')} />;
    return <CircleSlash2 {...ICON} className={cx(ICON.className, 'text-fg-2')} />;
}

function StepText({ label, timestamp, status, strong, muted, className }: { label: string; timestamp?: string | undefined; status: string; strong: boolean; muted: boolean; className: string }) {
    const date = formatDate(timestamp);
    return (
        <div className={cx('flex min-w-0 flex-col gap-0.5', className)}>
            <span className={cx('text-sm', strong ? 'font-semibold text-fg' : muted ? 'text-fg-3' : 'text-fg-2')}>
                {label}
                {status ? <span className="sr-only">, {status}</span> : null}
            </span>
            {date && timestamp ? (
                <time dateTime={timestamp} className="text-sm text-fg-3 tabular-nums">
                    {date}
                </time>
            ) : null}
        </div>
    );
}

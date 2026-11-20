import { useId } from 'react';

import { allowanceView, type EntitlementUsage, type Segment } from '@/lib/status';
import { cx } from '@/lib/ui';

/**
 * UX §11 Allowance meter: concepts · revisions; segments used / in progress / left; unlimited.
 * - A big number ("1 left", tabular-nums, text-2xl per §8.2), a segmented bar and a text legend.
 *   The legend carries the meaning; the bar is a picture of it (role=img, named by the legend), and
 *   each segment kind also differs in fill pattern, not colour alone (§8.1).
 * - "In progress" is a revision requested but not yet delivered (reserved); "used" is delivered
 *   (consumed), as UX §7 asks. The maths is Next's (lib/status.ts allowanceView).
 * - More than 12 slots become one proportional bar (still three parts). Unlimited shows no bar.
 */
type Props = {
    /** "Concepts" or "Revisions". */
    label: string;
    /** Singular and plural nouns for the legend, e.g. { one: 'revision', many: 'revisions' }. */
    noun: { one: string; many: string };
    usage: EntitlementUsage | undefined | null;
    as?: 'h2' | 'h3' | 'h4';
};

const SEGMENT: Record<Segment, string> = {
    used: 'border-fg-3 bg-fg-3',
    'in-progress': 'border-accent bg-stripes-in-progress',
    left: 'border-border bg-surface',
};

const LEGEND: Array<{ kind: Segment; text: (v: { used: number; inProgress: number; left: number }) => string }> = [
    { kind: 'used', text: (v) => `${v.used} used` },
    { kind: 'in-progress', text: (v) => `${v.inProgress} in progress` },
    { kind: 'left', text: (v) => `${v.left} left` },
];

export function AllowanceMeter({ label, noun, usage, as: Heading = 'h3' }: Props) {
    const view = allowanceView(usage, noun);
    const headingId = useId();

    return (
        <div role="group" aria-labelledby={headingId} data-unlimited={view.unlimited || undefined} className="flex flex-col gap-2">
            <Heading id={headingId} className="text-sm font-medium text-fg-2">
                {label}
            </Heading>
            <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-2xl font-semibold text-fg tabular-nums">{view.headline}</span>
                <span className="text-sm text-fg-2">{view.unlimited ? `${view.used} used` : `of ${view.limit} ${view.limit === 1 ? noun.one : noun.many}`}</span>
            </p>
            {view.segments ? (
                <div role="img" aria-label={view.legend} className="flex gap-1">
                    {view.segments.map((s, i) => (
                        <span key={i} data-segment={s} className={cx('h-2 flex-1 rounded-sm border', SEGMENT[s])} />
                    ))}
                </div>
            ) : view.bar ? (
                <div role="img" aria-label={view.legend} className="flex h-2 overflow-hidden rounded-sm border border-border bg-surface">
                    {(['used', 'in-progress'] as const).map((s) => {
                        const share = s === 'used' ? view.bar?.used : view.bar?.inProgress;
                        return share ? <span key={s} data-segment={s} className={cx('h-full', SEGMENT[s])} style={{ width: `${share * 100}%` }} /> : null;
                    })}
                </div>
            ) : null}
            {view.unlimited ? (
                view.inProgress > 0 ? <p className="text-sm text-fg-2">{view.inProgress} in progress</p> : null
            ) : (
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-2">
                    {LEGEND.map((l) => (
                        <li key={l.kind} className="flex items-center gap-1.5">
                            <span aria-hidden="true" className={cx('inline-block size-3 rounded-sm border', SEGMENT[l.kind])} />
                            {l.text(view)}
                        </li>
                    ))}
                    {view.over > 0 ? <li>{view.over} over the limit</li> : null}
                </ul>
            )}
        </div>
    );
}

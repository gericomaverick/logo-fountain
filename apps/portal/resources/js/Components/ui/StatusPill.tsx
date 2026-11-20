import { CircleArrowRight, CircleCheck, CirclePause, CircleSlash2, Hourglass, type LucideIcon } from 'lucide-react';

import { pillLabel, turnFor, type Turn } from '@/lib/status';
import { cx } from '@/lib/ui';

/**
 * UX §11 Status pill: the 5 turns (§2.5), text plus an icon, never colour alone. It takes the
 * project state (any of the 11) and derives the turn, so a screen can't pick a colour that
 * disagrees with the copy. Stage-specific colours are gone on purpose (§2.5).
 */
export const TURN_ICON: Record<Turn, LucideIcon> = {
    'your-turn': CircleArrowRight,
    'designers-turn': Hourglass,
    done: CircleCheck,
    paused: CirclePause,
    closed: CircleSlash2,
};

const TONE: Record<Turn, string> = {
    'your-turn': 'border-transparent bg-accent text-accent-fg',
    'designers-turn': 'border-divider bg-sunken text-fg-2',
    done: 'border-transparent bg-success-soft text-success',
    paused: 'border-transparent bg-warning-soft text-warning',
    closed: 'border-divider bg-sunken text-fg-3',
};

type Props = {
    /** The project state, e.g. "CONCEPTS_READY". Unknown values read as the designer's turn. */
    state: string;
};

export function StatusPill({ state }: Props) {
    const turn = turnFor(state);
    const Icon = TURN_ICON[turn];
    return (
        <span
            data-turn={turn}
            className={cx('inline-flex w-max items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-[0.02em] uppercase', TONE[turn])}
        >
            <Icon aria-hidden="true" size={16} strokeWidth={1.5} className="shrink-0" />
            {pillLabel(state)}
        </span>
    );
}

import { Sparkles } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { DisplayTitle } from '@/Components/ui/DisplayTitle';
import { StatusPill } from '@/Components/ui/StatusPill';
import { bannerCopy, CELEBRATION_COPY, pillLabel, turnFor, type Celebration, type Turn } from '@/lib/status';
import { cx } from '@/lib/ui';

/**
 * UX §11 Turn banner: **the** top element on project Overview. Variants follow the turn (§2.5):
 * your turn · designer's turn · done · paused · closed, plus a one-time celebration (§7).
 * - The pill (text + icon) says whose turn it is; the title and body say what that means, in the
 *   §2.5 copy (lib/status.ts BANNER_COPY), overridable per screen.
 * - `action` is the turn's single primary action (one primary per view, §5): pass a primary
 *   Button or a Link. Paused passes a link to messages (§2.5).
 * - `celebration` swaps the title for the display headline (display font via DisplayTitle, UX §8.2 use
 *   3). Showing it only once is the screen's job (it knows whether the moment has been seen).
 * - When the turn changes after the page loads (polling), the new turn is announced politely;
 *   the first render is not announced (it's just the page).
 */
type Props = {
    /** The project state, e.g. "CONCEPTS_READY". */
    state: string;
    title?: ReactNode;
    children?: ReactNode;
    action?: ReactNode;
    celebration?: Celebration;
};

const BOX: Record<Turn, string> = {
    'your-turn': 'border-transparent bg-accent-soft',
    'designers-turn': 'border-divider bg-surface',
    done: 'border-transparent bg-success-soft',
    paused: 'border-transparent bg-warning-soft',
    closed: 'border-divider bg-sunken',
};

export function TurnBanner({ state, title, children, action, celebration }: Props) {
    const turn = turnFor(state);
    const copy = bannerCopy(state);
    const headingId = useId();
    const heading = celebration ? CELEBRATION_COPY[celebration].title : (title ?? copy.title);
    const announcement = useTurnAnnouncement(`${pillLabel(state)}. ${typeof heading === 'string' ? heading : ''}`.trim(), state);

    return (
        <section
            aria-labelledby={headingId}
            data-turn={turn}
            data-celebration={celebration}
            className={cx('flex flex-col gap-3 rounded-lg border p-5 md:p-6', BOX[turn])}
        >
            <div className="flex items-center gap-2">
                <StatusPill state={state} />
                {celebration ? <Sparkles aria-hidden="true" size={20} strokeWidth={1.5} className="text-accent-text" /> : null}
            </div>
            <div id={headingId} className="flex flex-col gap-2">
                {celebration ? (
                    <DisplayTitle use="celebration" as="h2">
                        {heading}
                    </DisplayTitle>
                ) : (
                    <h2 className="text-xl font-semibold text-fg">{heading}</h2>
                )}
            </div>
            <div className="max-w-prose text-base text-fg-2">{children ?? copy.body}</div>
            {action ? <div className="mt-1 flex flex-wrap items-center gap-3">{action}</div> : null}
            <p aria-live="polite" aria-atomic="true" className="sr-only">
                {announcement}
            </p>
        </section>
    );
}

/** Empty on mount; the new text once `key` changes, so only a change of turn is announced. */
function useTurnAnnouncement(text: string, key: string): string {
    const first = useRef(key);
    const [said, setSaid] = useState('');
    useEffect(() => {
        if (key !== first.current) setSaid(text);
    }, [key, text]);
    return said;
}

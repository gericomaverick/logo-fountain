import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * UX §11 Empty state, per context: says what will appear here and when ("Your concepts will
 * appear here once your designer shares them"). Turnaround times are an open owner item (§15.2),
 * so callers shouldn't promise one until it's agreed. An optional action is the next step, if
 * there is one (never a dead end, §12); usually a secondary Button or a standalone Link.
 */
type Props = {
    title: ReactNode;
    /** What will appear here and when. */
    children?: ReactNode;
    icon?: LucideIcon;
    action?: ReactNode;
    as?: 'h2' | 'h3';
};

export function EmptyState({ title, children, icon: Icon, action, as: Heading = 'h2' }: Props) {
    return (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-10 text-center">
            {Icon ? <Icon aria-hidden="true" size={20} strokeWidth={1.5} className="text-fg-3" /> : null}
            <Heading className="text-lg font-semibold text-fg">{title}</Heading>
            {children ? <div className="max-w-prose text-base text-fg-2">{children}</div> : null}
            {action ? <div className="mt-1">{action}</div> : null}
        </div>
    );
}

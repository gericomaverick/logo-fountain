import { Link as InertiaLink } from '@inertiajs/react';
import { useId, type HTMLAttributes, type ReactNode } from 'react';

import { cx, usesNativeAnchor } from '@/lib/ui';

/**
 * UX §11 Card / Panel (story 1.8c): default · interactive · selected. No cards inside cards.
 * - Card: a surface with the md radius and a divider border; `interactive` adds the raised hover
 *   (light) / border tone (dark) for cards that are one big target. Make the target a real link or
 *   button inside (e.g. the title), stretched with `cardTargetClass`, so the card isn't a giant
 *   unlabelled click handler. `selected` uses accent-soft and an accent border, plus
 *   aria-current or a visible label at the call site (colour never alone, §8.1).
 * - Panel: a titled section (h2/h3 + optional actions) for overview blocks and admin columns.
 */
type CardProps = Omit<HTMLAttributes<HTMLElement>, 'className'> & {
    variant?: 'default' | 'interactive' | 'selected';
    /** `none` for media cards whose image runs to the edge. */
    padding?: 'none' | 'md';
    as?: 'div' | 'article' | 'section';
};

export function Card({ variant = 'default', padding = 'md', as: Tag = 'div', children, ...rest }: CardProps) {
    return (
        <Tag
            {...rest}
            data-variant={variant}
            className={cx(
                'relative flex min-w-0 flex-col overflow-hidden rounded-md border bg-surface text-fg',
                padding === 'md' && 'gap-3 p-4 md:p-5',
                variant === 'selected' ? 'border-accent bg-accent-soft' : 'border-divider',
                variant === 'interactive' && 'transition-shadow hover:shadow-raised focus-within:border-border dark:hover:border-border',
            )}
        >
            {children}
        </Tag>
    );
}

/** Stretches its link or button over the whole card (the card's one target), keeping focus visible. */
export const cardTargetClass =
    'rounded-sm after:absolute after:inset-0 after:rounded-md after:content-[""] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-accent';

/** The card's one link (usually its title), stretched over the card. Internal paths are Inertia visits. */
export function CardLink({ href, children, 'aria-describedby': describedBy }: { href: string; children: ReactNode; 'aria-describedby'?: string }) {
    const className = cx(cardTargetClass, 'text-fg no-underline underline-offset-2 hover:underline');
    return usesNativeAnchor(href) ? (
        <a href={href} aria-describedby={describedBy} className={className}>
            {children}
        </a>
    ) : (
        <InertiaLink href={href} aria-describedby={describedBy} className={className}>
            {children}
        </InertiaLink>
    );
}

type PanelProps = {
    title: ReactNode;
    /** h2 on screens, h3 inside a section that already has an h2. */
    level?: 2 | 3;
    description?: ReactNode;
    /** E.g. a small secondary Button or a Link, top right. */
    actions?: ReactNode;
    footer?: ReactNode;
    /** `sunken` for the admin properties column (§8.1 use: wells, properties column). */
    tone?: 'surface' | 'sunken';
    children?: ReactNode;
    id?: string;
};

export function Panel({ title, level = 2, description, actions, footer, tone = 'surface', children, id }: PanelProps) {
    const Heading = level === 2 ? 'h2' : 'h3';
    const generated = useId();
    const headingId = `${id ?? generated}-title`;
    return (
        <section
            id={id}
            aria-labelledby={headingId}
            className={cx('flex min-w-0 flex-col gap-4 rounded-md border border-divider p-4 md:p-5', tone === 'sunken' ? 'bg-sunken' : 'bg-surface')}
        >
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                    <Heading id={headingId} className="text-lg font-semibold text-fg">
                        {title}
                    </Heading>
                    {description ? <p className="text-sm text-fg-2">{description}</p> : null}
                </div>
                {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
            </header>
            {children}
            {footer ? <footer className="border-t border-divider pt-4">{footer}</footer> : null}
        </section>
    );
}


import { Link as InertiaLink } from '@inertiajs/react';
import type { ComponentPropsWithRef, MouseEvent } from 'react';

import { cx, usesNativeAnchor } from '@/lib/ui';

/**
 * UX §11 Link: inline · standalone, in `accent-text`.
 * - inline (inside a sentence) is ALWAYS underlined: accent-text against fg is under 3:1, so
 *   colour alone fails WCAG 1.4.1 / axe `link-in-text-block` (story 1.7). Hover and focus thicken it.
 * - standalone (on its own line or in a list) is underlined on hover and focus, and is at least
 *   24 px tall (§13 target size).
 * Internal paths are Inertia visits; other origins, schemes (mailto:) and #hashes are plain <a>.
 */
type Props = Pick<ComponentPropsWithRef<'a'>, 'children' | 'aria-label' | 'aria-current' | 'aria-describedby' | 'id' | 'rel' | 'target' | 'ref'> & {
    href: string;
    variant?: 'inline' | 'standalone';
    onClick?: (event: MouseEvent<Element>) => void;
};

const VARIANT = {
    inline: 'text-accent-text underline decoration-1 underline-offset-2 hover:decoration-2 focus-visible:decoration-2',
    standalone: 'inline-flex min-h-6 items-center gap-1 text-sm font-medium text-accent-text no-underline underline-offset-2 hover:underline focus-visible:underline',
} as const;

export function Link({ href, variant = 'inline', children, ...rest }: Props) {
    const className = cx('rounded-sm', VARIANT[variant]);
    if (usesNativeAnchor(href)) {
        return (
            <a {...rest} href={href} className={className}>
                {children}
            </a>
        );
    }
    return (
        <InertiaLink {...rest} href={href} className={className}>
            {children}
        </InertiaLink>
    );
}

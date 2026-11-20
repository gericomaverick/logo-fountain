import { useEffect, type ReactNode } from 'react';

/**
 * The ONLY way to use the display font (Sfizia), UX §8.2:
 * - three customer-facing uses: the project name on the customer Overview, the auth-screen
 *   headline, and the headline of a celebration turn banner;
 * - at least 32 px desktop / 28 px phone (text-3xl is 33 px at its smallest), regular weight;
 * - at most one per screen; never in the admin UI.
 * The design lint (scripts/design-lint.mjs) rejects the display font token anywhere else and
 * limits which files may render this component. No className prop, so callers can't restyle it.
 */
export type DisplayUse = 'project-overview' | 'auth' | 'celebration';

type Props = {
    use: DisplayUse;
    children: ReactNode;
    /** The heading level: h1 for Overview and auth, usually h2 inside a celebration banner. */
    as?: 'h1' | 'h2';
};

let mounted = 0;

export function DisplayTitle({ use, children, as: Tag = 'h1' }: Props) {
    useEffect(() => {
        mounted += 1;
        if (import.meta.env.DEV && mounted > 1) {
            console.warn('DisplayTitle: more than one Sfizia line on this screen (UX §8.2 allows one).');
        }
        return () => {
            mounted -= 1;
        };
    }, []);

    return (
        <Tag data-display-title={use} className="font-display text-3xl font-normal tracking-[-0.01em] text-balance lg:text-4xl">
            {children}
        </Tag>
    );
}

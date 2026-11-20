import { ArrowLeft } from 'lucide-react';

import { Link } from '@/Components/ui/Link';
import { cx } from '@/lib/ui';

/**
 * UX §5.3 rule 3 (story 1.9): breadcrumbs on desktop ("Projects › Brand name › Concepts"); on
 * phones, a back arrow with the parent's name. One `nav` named "Breadcrumb"; the last crumb is
 * the current page (`aria-current="page"`, plain text). The separators are decorative.
 */
export type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items, className }: { items: readonly Crumb[]; className?: string }) {
    if (items.length === 0) return null;
    const parent = items.length > 1 ? items[items.length - 2] : undefined;
    return (
        <nav aria-label="Breadcrumb" className={className}>
            {parent?.href ? (
                <div className="md:hidden">
                    <Link href={parent.href} variant="standalone" aria-label={`Back to ${parent.label}`}>
                        <ArrowLeft aria-hidden="true" size={16} strokeWidth={1.5} />
                        {parent.label}
                    </Link>
                </div>
            ) : null}
            <ol className={cx('flex-wrap items-center gap-1 text-sm text-fg-2', parent?.href ? 'hidden md:flex' : 'flex')}>
                {items.map((crumb, i) => {
                    const last = i === items.length - 1;
                    return (
                        <li key={`${i}-${crumb.label}`} className="inline-flex items-center gap-1">
                            {i > 0 ? (
                                <span aria-hidden="true" className="text-fg-3">
                                    ›
                                </span>
                            ) : null}
                            {last || !crumb.href ? (
                                <span aria-current={last ? 'page' : undefined} className={cx(last && 'font-medium text-fg')}>
                                    {crumb.label}
                                </span>
                            ) : (
                                <Link href={crumb.href} variant="standalone">
                                    {crumb.label}
                                </Link>
                            )}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}

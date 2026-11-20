import { skeletonRows, type SkeletonVariant } from '@/lib/status';
import { cx } from '@/lib/ui';

/**
 * UX §11 Skeleton: list · card · image, for **first load only** (polling updates silently, §12).
 * - Motion: no shimmer or pulse. UX §8.3 allows no looping animation, so the skeleton is static
 *   and only fades in once (animate-fade-in, 150 ms), which prefers-reduced-motion turns off
 *   (the base layer in app.css). Asserted in tests/browser/ui-status.spec.ts.
 * - Fixed boxes (images keep a 4:3 ratio) so the real content doesn't shift the layout.
 * - One polite status per skeleton ("Loading concepts…"); the blocks are hidden from AT.
 */
type Props = {
    variant: SkeletonVariant;
    /** What's loading, e.g. "concepts" → "Loading concepts…". */
    what: string;
    /** List rows, or cards/images in a grid (1–8). */
    count?: number;
};

const BLOCK = 'block rounded-sm bg-sunken';

export function Skeleton({ variant, what, count }: Props) {
    const items = Array.from({ length: skeletonRows(count ?? (variant === 'list' ? 3 : 1)) }, (_, i) => i);
    return (
        <div role="status" data-skeleton={variant} className="motion-safe:animate-fade-in">
            <span className="sr-only">Loading {what}…</span>
            <div aria-hidden="true" className={variant === 'list' ? 'flex flex-col divide-y divide-divider' : 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'}>
                {items.map((i) =>
                    variant === 'list' ? (
                        <div key={i} className="flex items-center gap-3 py-3">
                            <span className={cx(BLOCK, 'size-10 shrink-0 rounded-md')} />
                            <span className="flex flex-1 flex-col gap-2">
                                <span className={cx(BLOCK, 'h-4 w-2/5')} />
                                <span className={cx(BLOCK, 'h-3 w-3/5')} />
                            </span>
                        </div>
                    ) : variant === 'card' ? (
                        <div key={i} className="flex flex-col gap-3 rounded-lg border border-divider bg-surface p-4">
                            <span className={cx(BLOCK, 'aspect-[4/3] w-full rounded-md')} />
                            <span className={cx(BLOCK, 'h-4 w-1/2')} />
                            <span className={cx(BLOCK, 'h-3 w-1/3')} />
                        </div>
                    ) : (
                        <span key={i} className={cx(BLOCK, 'aspect-[4/3] w-full rounded-lg')} />
                    ),
                )}
            </div>
        </div>
    );
}

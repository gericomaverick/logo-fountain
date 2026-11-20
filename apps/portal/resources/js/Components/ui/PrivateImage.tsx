import { ImageOff } from 'lucide-react';
import { useState } from 'react';

import { stableImage, type SignedImage } from '@/lib/media';
import { cx } from '@/lib/ui';

/**
 * <PrivateImage> (ADR-021, DV-12, F-15; UX §11 Concept card "graceful preview unavailable";
 * story 1.8c). Images come from private R2 through short-lived signed URLs:
 * - it keeps the rendered `src` while `image.imageKey` is unchanged, so a poll that re-signs the
 *   URL never re-downloads or flickers it; a new key, or a URL ≤ 5 min from expiry, swaps it;
 * - no image, or a failed load, shows "Preview unavailable" (icon + text, named by the alt);
 * - the box has a fixed aspect ratio, so nothing shifts while the image loads.
 */
type Props = {
    image: SignedImage | null;
    /** UX §13: "Concept {n}, version {v}". */
    alt: string;
    ratio?: 'square' | 'landscape';
    /** `contain` for logos (never cropped); `cover` only for decorative thumbnails. */
    fit?: 'contain' | 'cover';
    /** Padding around a contained logo. */
    inset?: boolean;
    className?: string;
};

export function PrivateImage({ image, alt, ratio = 'landscape', fit = 'contain', inset = true, className }: Props) {
    const [shown, setShown] = useState<SignedImage | null>(image);
    const [incoming, setIncoming] = useState<SignedImage | null>(image);
    const [failedUrl, setFailedUrl] = useState<string | null>(null);

    // Derive during render (React's "adjusting state when a prop changes"): only an actual change
    // of key, or a near-expiry URL, replaces what's on screen.
    if (image !== incoming) {
        setIncoming(image);
        // Only runs when the prop changes (an event, not a re-render), and only decides whether the old
        // URL is close to expiry (ADR-021), so reading the clock here is safe.
        // eslint-disable-next-line react-hooks/purity -- see above
        const next = stableImage(shown, image, Date.now());
        if (next !== shown) setShown(next);
    }

    const unavailable = !shown || failedUrl === shown.url;
    return (
        <div className={cx('relative w-full overflow-hidden bg-surface', ratio === 'square' ? 'aspect-square' : 'aspect-4/3', className)}>
            {unavailable ? (
                <div role="img" aria-label={`${alt}: preview unavailable`} className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-sunken p-4 text-center">
                    <ImageOff aria-hidden="true" size={20} strokeWidth={1.5} className="text-fg-3" />
                    <span aria-hidden="true" className="text-sm text-fg-2">
                        Preview unavailable
                    </span>
                </div>
            ) : (
                <img
                    key={shown.imageKey}
                    src={shown.url}
                    alt={alt}
                    decoding="async"
                    draggable={false}
                    onError={() => setFailedUrl(shown.url)}
                    className={cx('absolute inset-0 size-full', fit === 'contain' ? 'object-contain' : 'object-cover', inset && fit === 'contain' && 'p-4')}
                />
            )}
        </div>
    );
}

import { RefreshCw } from 'lucide-react';

/**
 * The visible and spoken side of usePolling (story 1.8c; UX §12 "Loading and freshness").
 * - `reconnecting`: a quiet inline line, "Reconnecting…", never a blocking error or a dialog. It is
 *   a polite status, so it's spoken once without interrupting.
 * - `announcement`: an always-present, visually hidden polite live region ("2 new messages"). It
 *   exists before any update, so screen readers pick the change up; it never takes focus.
 * Pass the hook result straight in: <PollingStatus {...polling} />.
 */
type Props = {
    reconnecting: boolean;
    announcement: string;
    /** Optional "Retry now" (polls at once). */
    refresh?: () => void;
};

export function PollingStatus({ reconnecting, announcement, refresh }: Props) {
    return (
        <>
            <div role="status" className="empty:hidden">
                {reconnecting ? (
                    <p className="flex flex-wrap items-center gap-2 text-sm text-fg-2" data-polling="reconnecting">
                        <RefreshCw aria-hidden="true" size={16} strokeWidth={1.5} className="text-warning" />
                        <span>Reconnecting…</span>
                        {refresh ? (
                            <button
                                type="button"
                                onClick={refresh}
                                className="min-h-6 rounded-sm font-medium text-accent-text underline underline-offset-2 pointer-coarse:min-h-11"
                            >
                                Retry now
                            </button>
                        ) : null}
                    </p>
                ) : null}
            </div>
            <div aria-live="polite" aria-atomic="true" className="sr-only" data-polling="announcer">
                {announcement}
            </div>
        </>
    );
}

// The polling engine behind hooks/usePolling (story 1.8c; FR58, ADR-023, UX §12 "Loading and
// freshness"). Framework-free and import-free, so tests/js runs it under node:test mock timers.
//
// What it adds over Next (which has five hand-rolled setInterval/setTimeout loops, no shared hook):
// - one request at a time: the next poll is scheduled when the previous one settles (no overlap);
// - FAILURE_THRESHOLD (3) consecutive failures → `reconnecting`, and from then on exponential
//   backoff (interval × 2^(failures − 2), capped at MAX_BACKOFF_MS); a success resets both;
// - a hidden tab pauses (no timer, no request); becoming visible polls at once, then resumes;
// - `announce(prev, next)` turns new items into one polite announcement string.

/** FR58 / ADR-023 intervals, with the Next source each one keeps. */
export const POLL_INTERVALS = {
    /** Customer project overview: `project-hub.tsx:269` `setInterval(…, 10000)`. */
    customerProject: 10_000,
    /** Admin project workspace: `admin/projects/[id]/page.tsx:178` `setInterval(…, 2000)`. */
    adminProject: 2_000,
    /** Admin audit log: `admin/projects/[id]/audit/page.tsx:57` `setInterval(…, 2500)`. */
    adminAudit: 2_500,
    /** Checkout success: `FAST_POLL_INTERVAL_MS` (`success-processing-client.tsx:15`). */
    checkoutFast: 2_000,
    /** …and `SLOW_POLL_INTERVAL_MS` once `TROUBLESHOOTING_TIMEOUT_MS` (45 000) has passed. */
    checkoutSlow: 10_000,
    checkoutSlowAfter: 45_000,
    /** Upsell confirmation on the hub: `project-hub.tsx:193` (2500 once, then 7000). */
    upsellFirst: 2_500,
    upsellThen: 7_000,
} as const;

/** UX §12: "If polling fails 3 times: a quiet Reconnecting… inline notice". */
export const FAILURE_THRESHOLD = 3;
/** New (Next never backs off): the longest wait between attempts while reconnecting. */
export const MAX_BACKOFF_MS = 60_000;

/** The checkout schedule: 2 s, then 10 s once 45 s have passed since polling started. */
export function checkoutInterval(elapsedMs: number): number {
    return elapsedMs >= POLL_INTERVALS.checkoutSlowAfter ? POLL_INTERVALS.checkoutSlow : POLL_INTERVALS.checkoutFast;
}

/**
 * The wait before the next attempt. Below the threshold a failure retries on the normal interval
 * (as Next does); at and beyond it the wait doubles each time, from 2× the interval, up to the cap
 * (never shorter than the interval itself).
 */
export function nextDelay(intervalMs: number, consecutiveFailures: number, maxBackoffMs: number = MAX_BACKOFF_MS): number {
    if (consecutiveFailures < FAILURE_THRESHOLD) return intervalMs;
    const backoff = intervalMs * 2 ** (consecutiveFailures - FAILURE_THRESHOLD + 1);
    return Math.max(intervalMs, Math.min(backoff, maxBackoffMs));
}

/** "1 new message" / "3 new messages", or null for none. */
export function newItemsAnnouncement(count: number, singular: string, plural = `${singular}s`): string | null {
    if (count <= 0) return null;
    return `${count} new ${count === 1 ? singular : plural}`;
}

/** How many of `next`'s ids weren't in `prev` (items are keyed, never compared by position). */
export function countNewIds(prev: readonly { id: string }[] | undefined, next: readonly { id: string }[]): number {
    if (!prev) return 0; // the first load isn't "new"
    const seen = new Set(prev.map((item) => item.id));
    return next.filter((item) => !seen.has(item.id)).length;
}

export type PollState<T> = {
    data: T | undefined;
    /** The last error, kept until the next success (screens decide whether to show it). */
    error: unknown;
    consecutiveFailures: number;
    /** True from the FAILURE_THRESHOLD-th consecutive failure until the next success. */
    reconnecting: boolean;
    /** True while the page is hidden (no requests are made). */
    paused: boolean;
    /** Epoch ms of the last success, or null. */
    lastSuccessAt: number | null;
    /** True once `stopWhen` matched: polling has ended. */
    done: boolean;
};

/** Where visibility comes from: `document` in the browser, a fake in tests. */
export type VisibilitySource = {
    hidden(): boolean;
    subscribe(listener: () => void): () => void;
};

export type PollerOptions<T> = {
    /** One request. Throw (or reject) on failure. The signal aborts when the poller stops. */
    fetch: (signal: AbortSignal) => Promise<T>;
    /** A fixed interval, or one derived from the time since start() (the checkout schedule). */
    interval: number | ((elapsedMs: number) => number);
    /** Data the page already has (the Inertia first paint), so the first request waits an interval. */
    initialData?: T | undefined;
    /** Fetch at once on start (default: only when there's no initialData). */
    immediate?: boolean;
    /** Stop for good once this is true (e.g. a checkout is fulfilled). */
    stopWhen?: (data: T) => boolean;
    /** The polite announcement for an update, or null for none (e.g. "2 new messages"). */
    announce?: (prev: T | undefined, next: T) => string | null;
    maxBackoffMs?: number;
    visibility?: VisibilitySource | undefined;
    now?: () => number;
    onState: (state: PollState<T>) => void;
    onAnnounce?: (message: string) => void;
};

export type Poller = {
    start(): void;
    stop(): void;
    /** Poll now (e.g. "Retry now"), resetting the schedule. Ignored while a request is in flight. */
    refresh(): void;
};

export function documentVisibility(): VisibilitySource | undefined {
    if (typeof document === 'undefined') return undefined;
    return {
        hidden: () => document.visibilityState === 'hidden',
        subscribe: (listener) => {
            document.addEventListener('visibilitychange', listener);
            return () => document.removeEventListener('visibilitychange', listener);
        },
    };
}

export function createPoller<T>(options: PollerOptions<T>): Poller {
    const now = options.now ?? Date.now;
    const visibility = options.visibility;
    let state: PollState<T> = {
        data: options.initialData,
        error: null,
        consecutiveFailures: 0,
        reconnecting: false,
        paused: false,
        lastSuccessAt: options.initialData === undefined ? null : now(),
        done: false,
    };
    let running = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;
    let startedAt = 0;
    let unsubscribe: (() => void) | null = null;

    const set = (patch: Partial<PollState<T>>) => {
        state = { ...state, ...patch };
        options.onState(state);
    };
    const interval = () => (typeof options.interval === 'function' ? options.interval(now() - startedAt) : options.interval);
    const clear = () => {
        if (timer !== null) clearTimeout(timer);
        timer = null;
    };
    const schedule = (delay: number) => {
        clear();
        if (!running || state.done || state.paused) return;
        timer = setTimeout(() => {
            timer = null;
            void tick();
        }, delay);
    };

    const tick = async () => {
        if (!running || state.done || state.paused || inFlight) return;
        inFlight = true;
        controller = new AbortController();
        const signal = controller.signal;
        try {
            const next = await options.fetch(signal);
            if (!running || signal.aborted) return;
            const prev = state.data;
            const message = options.announce?.(prev, next) ?? null;
            const done = options.stopWhen?.(next) ?? false;
            set({ data: next, error: null, consecutiveFailures: 0, reconnecting: false, lastSuccessAt: now(), done });
            if (message) options.onAnnounce?.(message);
        } catch (error) {
            if (!running || signal.aborted) return;
            const failures = state.consecutiveFailures + 1;
            set({ error, consecutiveFailures: failures, reconnecting: failures >= FAILURE_THRESHOLD });
        } finally {
            inFlight = false;
            controller = null;
        }
        schedule(nextDelay(interval(), state.consecutiveFailures, options.maxBackoffMs));
    };

    const onVisibility = () => {
        if (!running || !visibility) return;
        if (visibility.hidden()) {
            clear();
            if (!state.paused) set({ paused: true });
        } else if (state.paused) {
            set({ paused: false });
            void tick(); // fresh data when the reader comes back; tick schedules the next one
        }
    };

    return {
        start() {
            if (running) return;
            running = true;
            startedAt = now();
            unsubscribe = visibility?.subscribe(onVisibility) ?? null;
            const hidden = visibility?.hidden() ?? false;
            if (hidden) {
                set({ paused: true });
                return; // the first request waits for the page to be shown
            }
            if (options.immediate ?? options.initialData === undefined) void tick();
            else schedule(interval());
        },
        stop() {
            running = false;
            clear();
            controller?.abort();
            unsubscribe?.();
            unsubscribe = null;
        },
        refresh() {
            if (!running || inFlight || state.done) return;
            clear();
            void tick();
        },
    };
}

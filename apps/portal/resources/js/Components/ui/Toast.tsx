import { CircleAlert, CircleCheck, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { addToast, cx, removeToast, toastDismissAfter, type Toast as ToastData, type ToastTone } from '@/lib/ui';

/**
 * UX §11 Toast: success · error. Success goes in a role=status region and dismisses itself after
 * 5 s (paused while hovered or focused, WCAG 2.2.1); an error goes in a role=alert region and
 * stays until dismissed. Both regions are always in the DOM so screen readers pick up new toasts.
 * Wrap the app (the shells, 1.9) in <ToastProvider>; call useToast().success("…") / .error("…").
 * §12 level 1: routine, reversible actions get a toast and no confirmation.
 * Inside a modal dialog, use an InlineAlert instead: a modal hides everything outside it.
 */
type ToastApi = { success: (message: string) => void; error: (message: string) => void };

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast must be used inside <ToastProvider>.');
    return ctx;
}

/** `aboveTabBar`: lift the stack over the phone bottom tab bar (the customer project shell, story 1.9). */
export function ToastProvider({ children, aboveTabBar = false }: { children: ReactNode; aboveTabBar?: boolean }) {
    const [toasts, setToasts] = useState<ToastData[]>([]);
    const nextId = useRef(1);

    const push = useCallback((tone: ToastTone, message: string) => {
        setToasts((list) => addToast(list, { id: nextId.current++, tone, message }));
    }, []);
    const dismiss = useCallback((id: number) => setToasts((list) => removeToast(list, id)), []);
    const api = useMemo<ToastApi>(() => ({ success: (m) => push('success', m), error: (m) => push('error', m) }), [push]);

    return (
        <ToastContext.Provider value={api}>
            {children}
            <div className={cx('pointer-events-none fixed inset-x-4 z-60 flex flex-col gap-2 sm:left-auto sm:w-96', aboveTabBar ? 'bottom-20 md:bottom-4' : 'bottom-4')}>
                <div role="status" aria-live="polite" className="flex flex-col gap-2">
                    {toasts
                        .filter((t) => t.tone === 'success')
                        .map((t) => (
                            <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
                        ))}
                </div>
                <div role="alert" aria-live="assertive" className="flex flex-col gap-2">
                    {toasts
                        .filter((t) => t.tone === 'error')
                        .map((t) => (
                            <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
                        ))}
                </div>
            </div>
        </ToastContext.Provider>
    );
}

function ToastItem({ toast, onDismiss }: { toast: ToastData; onDismiss: (id: number) => void }) {
    const [paused, setPaused] = useState(false);
    const after = toastDismissAfter(toast.tone);

    useEffect(() => {
        if (after === null || paused) return;
        const timer = window.setTimeout(() => onDismiss(toast.id), after);
        return () => window.clearTimeout(timer);
    }, [after, paused, onDismiss, toast.id]);

    const Icon = toast.tone === 'success' ? CircleCheck : CircleAlert;
    return (
        <div
            data-tone={toast.tone}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
            className="pointer-events-auto flex items-start gap-3 rounded-md border border-border bg-surface py-2 pr-2 pl-4 text-base text-fg shadow-overlay"
        >
            <Icon aria-hidden="true" size={20} strokeWidth={1.5} className={cx('mt-2.5 shrink-0', toast.tone === 'success' ? 'text-success' : 'text-danger')} />
            <p className="min-w-0 flex-1 py-2">
                <span className="sr-only">{toast.tone === 'success' ? 'Success: ' : 'Error: '}</span>
                {toast.message}
            </p>
            <button
                type="button"
                aria-label="Dismiss"
                onClick={() => onDismiss(toast.id)}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-fg-2 transition-colors hover:bg-sunken hover:text-fg"
            >
                <X aria-hidden="true" size={20} strokeWidth={1.5} />
            </button>
        </div>
    );
}

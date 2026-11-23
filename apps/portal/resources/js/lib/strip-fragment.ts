import { router } from '@inertiajs/react';
import { useEffect } from 'react';

/**
 * Inertia keeps the URL fragment in its page state and writes it back into history after the first render, so
 * stripping once is not enough: strip again when it finishes booting (`navigate`) and on the next tick (story 4.9b AC 2).
 */
export function useStripFragment(): void {
    useEffect(() => {
        const strip = () => {
            if (window.location.hash !== '') window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
        };
        strip();
        // Inertia writes its own copy back asynchronously after boot; keep stripping for a short window.
        const timer = window.setInterval(strip, 50);
        const stop = window.setTimeout(() => window.clearInterval(timer), 2000);
        const off = router.on('navigate', strip);
        return () => {
            window.clearInterval(timer);
            window.clearTimeout(stop);
            off();
        };
    }, []);
}

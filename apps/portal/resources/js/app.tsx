import { createInertiaApp } from '@inertiajs/react';
import { createRoot } from 'react-dom/client';

import { followSystemTheme } from '@/lib/theme';

// Puts the fonts in the Vite manifest so app.blade.php can preload them with Vite::asset().
import.meta.glob('../fonts/**/*.woff2', { eager: true, query: '?url', import: 'default' });

followSystemTheme();

createInertiaApp({
    title: (title) => (title ? `${title} · Logo Fountain` : 'Logo Fountain'),
    // Lazy: one chunk per page, so the dev-only catalogue (Pages/Dev, story 1.8a) and each
    // screen's code load only where they're used.
    resolve: (name) => {
        const pages = import.meta.glob('./Pages/**/*.tsx');
        const page = pages[`./Pages/${name}.tsx`];
        if (!page) throw new Error(`Unknown Inertia page: ${name}`);
        return page() as never;
    },
    setup({ el, App, props }) {
        createRoot(el).render(<App {...props} />);
    },
});

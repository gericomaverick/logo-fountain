import { createInertiaApp } from '@inertiajs/react';
import { createRoot } from 'react-dom/client';

import { followSystemTheme } from '@/lib/theme';

// Puts the fonts in the Vite manifest so app.blade.php can preload them with Vite::asset().
import.meta.glob('../fonts/**/*.woff2', { eager: true, query: '?url', import: 'default' });

followSystemTheme();

createInertiaApp({
    title: (title) => (title ? `${title} · Logo Fountain` : 'Logo Fountain'),
    resolve: (name) => {
        const pages = import.meta.glob('./Pages/**/*.tsx', { eager: true });
        return pages[`./Pages/${name}.tsx`] as never;
    },
    setup({ el, App, props }) {
        createRoot(el).render(<App {...props} />);
    },
});

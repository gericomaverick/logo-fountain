import { createInertiaApp } from '@inertiajs/react';
import { createRoot } from 'react-dom/client';

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

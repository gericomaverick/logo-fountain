import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import laravel from 'laravel-vite-plugin';
import { defineConfig } from 'vite';

const hostPort = process.env.PORTAL_VITE_PORT ?? '5173';

export default defineConfig({
    plugins: [
        laravel({
            input: ['resources/css/app.css', 'resources/js/app.tsx'],
            refresh: true,
        }),
        react(),
        tailwindcss(),
    ],
    // Story 1.9: pre-bundle every page's dependencies when the dev server starts. Pages are lazy
    // chunks, so otherwise Vite finds a page's deps on its first visit, re-optimises and reloads
    // the browser mid-test (a cold CI ui job, or the first visit after npm install).
    optimizeDeps: {
        entries: ['resources/js/app.tsx', 'resources/js/Pages/**/*.tsx'],
    },
    server: {
        host: '0.0.0.0',
        port: 5173,
        strictPort: true,
        // The host port can differ from 5173 (parallel stacks: PORTAL_VITE_PORT in compose.yaml).
        origin: `http://localhost:${hostPort}`,
        hmr: { host: 'localhost', clientPort: Number(hostPort) },
        // Module scripts and fonts are CORS requests: allow the app on any local port, not only APP_URL.
        cors: { origin: /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/ },
        watch: {
            ignored: ['**/storage/framework/views/**'],
        },
    },
});

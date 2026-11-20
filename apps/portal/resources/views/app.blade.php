<!DOCTYPE html>
<html lang="en-GB">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="robots" content="noindex, nofollow">
        <meta name="color-scheme" content="light dark">
        {{-- Sets data-theme before any CSS paints (UX §8.1, NFR-A4). A file, not inline, for CSP 'self'. --}}
        <script src="/theme-init.js"></script>
        {{-- Self-hosted fonts (UX §8.2): Inter everywhere; Sfizia only on pages with a DisplayTitle. --}}
        <link rel="preload" as="font" type="font/woff2" href="{{ Vite::asset('resources/fonts/inter/inter-latin-wght-normal.woff2') }}" crossorigin>
        @if (in_array($page['component'] ?? null, config('ui.display_font_pages'), true))
            <link rel="preload" as="font" type="font/woff2" href="{{ Vite::asset('resources/fonts/sfizia/atipo-sfizia-regular.woff2') }}" crossorigin>
        @endif
        @viteReactRefresh
        {{-- Story 1.9 (NFR-P2): the current page's chunk too (Laravel's Inertia pattern), so its code and
             imports are modulepreloaded with app.js instead of fetched after it runs. --}}
        @php($pageEntry = 'resources/js/Pages/'.($page['component'] ?? '').'.tsx')
        @vite(array_values(array_filter(['resources/css/app.css', 'resources/js/app.tsx', is_file(base_path($pageEntry)) ? $pageEntry : null])))
        <x-inertia::head>
            <title>{{ config('app.name') }}</title>
        </x-inertia::head>
    </head>
    <body>
        <x-inertia::app />
    </body>
</html>

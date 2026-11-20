import { Head } from '@inertiajs/react';

import { DisplayTitle } from '@/Components/ui/DisplayTitle';
import { ThemeSwitcher } from '@/Components/ui/ThemeSwitcher';

// Token showcase (story 1.7) so the theme and visual checks have something to render.
// Not a real screen: the customer and admin screens follow the UX spec from story 1.8 on.
// Its DisplayTitle use is the placeholder for the Overview project-name heading.
const SWATCHES = [
    ['bg', 'bg-bg'],
    ['surface', 'bg-surface'],
    ['sunken', 'bg-sunken'],
    ['accent', 'bg-accent'],
    ['accent-soft', 'bg-accent-soft'],
    ['success-soft', 'bg-success-soft'],
    ['warning-soft', 'bg-warning-soft'],
    ['danger-soft', 'bg-danger-soft'],
] as const;

export default function Home() {
    return (
        <>
            <Head title="Portal" />
            <main className="mx-auto flex max-w-content flex-col gap-8 px-4 py-10 md:px-6 lg:px-10">
                <header className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex flex-col gap-2">
                        <p className="text-sm text-fg-3">Logo Fountain portal</p>
                        <DisplayTitle use="project-overview">Studio paper</DisplayTitle>
                    </div>
                    <ThemeSwitcher />
                </header>

                <section aria-labelledby="type" className="flex flex-col gap-3 rounded-lg border border-divider bg-surface p-6 shadow-raised">
                    <h2 id="type" className="text-lg font-semibold">
                        Type and text tokens
                    </h2>
                    <p className="max-w-prose text-fg">Primary text in Inter, read as a sentence at the base step.</p>
                    <p className="text-fg-2">Secondary text for descriptions.</p>
                    <p className="text-sm text-fg-3">Tertiary text: timestamps and hints.</p>
                    <p className="text-sm">
                        Order reference <code className="font-mono text-fg-2">LF-2026-0042</code> ·{' '}
                        <a href="#type" className="text-accent-text underline underline-offset-2">
                            accent link
                        </a>
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <span className="rounded-sm bg-accent px-2 py-1 text-xs font-semibold text-accent-fg">Your turn</span>
                        <span className="rounded-sm bg-success-soft px-2 py-1 text-xs font-semibold text-success">Done</span>
                        <span className="rounded-sm bg-warning-soft px-2 py-1 text-xs font-semibold text-warning">Paused</span>
                        <span className="rounded-sm bg-danger-soft px-2 py-1 text-xs font-semibold text-danger">Error</span>
                    </div>
                </section>

                <section aria-labelledby="colour" className="flex flex-col gap-3">
                    <h2 id="colour" className="text-lg font-semibold">
                        Surfaces
                    </h2>
                    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {SWATCHES.map(([name, cls]) => (
                            <li key={name} className="flex flex-col gap-2 text-sm text-fg-2">
                                <span className={`h-12 rounded-md border border-divider ${cls}`} aria-hidden="true" />
                                {name}
                            </li>
                        ))}
                    </ul>
                </section>
            </main>
        </>
    );
}

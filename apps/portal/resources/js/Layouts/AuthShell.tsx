import { Head } from '@inertiajs/react';
import type { ReactNode } from 'react';

import { ThemeSwitcher } from '@/Components/ui/ThemeSwitcher';

/**
 * The auth screens' layout (UX §14, story 4.9b): a centred form column, and on desktop only a flat brand panel
 * built from the tokens (open question 1: no new imagery). One h1 per screen; the form is the primary action.
 */
type Props = { title: string; subtitle?: string; children: ReactNode };

export function AuthShell({ title, subtitle, children }: Props) {
    return (
        <>
            <Head title={title} />
            <div className="grid min-h-screen lg:grid-cols-2">
                <main id="main" className="flex flex-col justify-center gap-6 px-4 py-10 md:px-10">
                    <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
                        <p className="text-base font-semibold text-fg">Logo Fountain</p>
                        <header className="flex flex-col gap-2">
                            <h1 className="text-2xl font-semibold text-fg">{title}</h1>
                            {subtitle ? <p className="text-base text-fg-2">{subtitle}</p> : null}
                        </header>
                        {children}
                        <ThemeSwitcher />
                    </div>
                </main>
                <aside aria-hidden="true" className="hidden flex-col justify-end bg-accent-soft p-10 lg:flex">
                    <p className="text-2xl font-semibold text-accent-text">Your logo, step by step.</p>
                    <p className="mt-2 text-base text-fg-2">Concepts, feedback and final files, in one place.</p>
                </aside>
            </div>
        </>
    );
}

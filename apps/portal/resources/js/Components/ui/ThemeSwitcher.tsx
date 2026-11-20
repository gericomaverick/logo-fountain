import { useSyncExternalStore } from 'react';

import { currentPreference, setThemePreference, subscribeTheme, type ThemePreference } from '@/lib/theme';

const OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string }> = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
];

/** System, Light or Dark (UX §8.1, §11). Kept in this browser; System follows the OS live. */
export function ThemeSwitcher() {
    const preference = useSyncExternalStore(subscribeTheme, currentPreference, () => 'system' as ThemePreference);

    return (
        <div role="radiogroup" aria-label="Theme" className="inline-flex gap-1 rounded-md border border-border bg-surface p-1">
            {OPTIONS.map(({ value, label }) => {
                const active = preference === value;
                return (
                    <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setThemePreference(value)}
                        className={`min-h-6 rounded-sm px-3 py-1 text-sm font-medium transition-colors ${
                            active ? 'bg-accent text-accent-fg' : 'text-fg-2 hover:bg-sunken hover:text-fg'
                        }`}
                    >
                        {label}
                    </button>
                );
            })}
        </div>
    );
}

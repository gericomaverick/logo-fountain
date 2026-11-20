import { useSyncExternalStore } from 'react';

import { ChoiceChips } from '@/Components/ui/ChoiceChips';
import { currentPreference, setThemePreference, subscribeTheme, type ThemePreference } from '@/lib/theme';

const OPTIONS = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
] as const satisfies ReadonlyArray<{ value: ThemePreference; label: string }>;

/**
 * System, Light or Dark (UX §8.1, §11). Kept in this browser; System follows the OS live.
 * Story 1.8a: single-choice Choice chips (native radios, so arrow keys move the choice), in a
 * group named "Theme" by a visually hidden legend.
 */
export function ThemeSwitcher() {
    const preference = useSyncExternalStore(subscribeTheme, currentPreference, () => 'system' as ThemePreference);

    return (
        <ChoiceChips
            legend="Theme"
            hideLegend
            name="theme"
            size="sm"
            options={OPTIONS}
            value={preference}
            onChange={(value) => setThemePreference(value as ThemePreference)}
        />
    );
}

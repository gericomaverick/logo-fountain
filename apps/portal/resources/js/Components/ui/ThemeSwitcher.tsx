import { useSyncExternalStore } from 'react';

import { ChoiceChips } from '@/Components/ui/ChoiceChips';
import { MenuLabel, MenuRadioGroup, MenuRadioItem } from '@/Components/ui/Menu';
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

/**
 * The same choice inside the user menu (UX §8.1: "chosen in Account and the user menu"; story 1.9).
 * Choosing keeps the menu open, so the change is visible and can be undone.
 */
export function ThemeMenuItems() {
    const preference = useSyncExternalStore(subscribeTheme, currentPreference, () => 'system' as ThemePreference);
    return (
        <>
            <MenuLabel>Theme</MenuLabel>
            <MenuRadioGroup label="Theme" value={preference} onValueChange={(value) => setThemePreference(value as ThemePreference)}>
                {OPTIONS.map((o) => (
                    <MenuRadioItem key={o.value} value={o.value}>
                        {o.label}
                    </MenuRadioItem>
                ))}
            </MenuRadioGroup>
        </>
    );
}

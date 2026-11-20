// Theme preference (UX §8.1): System (default) / Light / Dark, kept in this browser.
// public/theme-init.js applies it before first paint; this module changes it and keeps
// "System" following the OS live.

export type ThemePreference = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'lf-theme';
const CHANGE_EVENT = 'lf-theme-change';
const DARK_QUERY = '(prefers-color-scheme: dark)';

export function resolveTheme(preference: ThemePreference, systemDark: boolean): Theme {
    return preference === 'dark' || (preference === 'system' && systemDark) ? 'dark' : 'light';
}

export function currentPreference(): ThemePreference {
    const pref = document.documentElement.dataset.themePref;
    return pref === 'light' || pref === 'dark' ? pref : 'system';
}

function apply(preference: ThemePreference): void {
    const root = document.documentElement;
    root.dataset.theme = resolveTheme(preference, window.matchMedia(DARK_QUERY).matches);
    root.dataset.themePref = preference;
    window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function setThemePreference(preference: ThemePreference): void {
    try {
        localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
        // Storage blocked (private mode): the choice lasts for this page only.
    }
    apply(preference);
}

export function subscribeTheme(onChange: () => void): () => void {
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

/** Follow OS theme changes while the preference is "system". Call once at boot. */
export function followSystemTheme(): () => void {
    const media = window.matchMedia(DARK_QUERY);
    const follow = () => {
        if (currentPreference() === 'system') apply('system');
    };
    media.addEventListener('change', follow);
    return () => media.removeEventListener('change', follow);
}

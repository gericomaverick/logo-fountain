"use client";

import { useEffect, useSyncExternalStore } from "react";

import { MonitorIcon, MoonIcon, SunIcon } from "@/components/icons";

export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "lf-theme";

export function resolveTheme(preference: ThemePreference, systemDark: boolean): "light" | "dark" {
  return preference === "dark" || (preference === "system" && systemDark) ? "dark" : "light";
}

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

const CHANGE = "lf-theme-change";

function apply(preference: ThemePreference) {
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(preference, systemPrefersDark());
  root.dataset.themePref = preference;
  window.dispatchEvent(new Event(CHANGE));
}

// The choice lives on <html data-theme-pref>, put there before hydration by
// /theme-init.js: read it as an external store, and on the server assume System.
function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE, onChange);
  return () => window.removeEventListener(CHANGE, onChange);
}

function currentPreference(): ThemePreference {
  const saved = document.documentElement.dataset.themePref;
  return saved === "light" || saved === "dark" ? saved : "system";
}

const OPTIONS: Array<{ value: ThemePreference; label: string; Icon: typeof SunIcon }> = [
  { value: "system", label: "System", Icon: MonitorIcon },
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
];

/** System, Light or Dark: kept in this browser, and followed live while on System. */
export function ThemeSwitcher() {
  const preference = useSyncExternalStore(subscribe, currentPreference, () => "system" as ThemePreference);

  useEffect(() => {
    if (preference !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const follow = () => apply("system");
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, [preference]);

  function choose(next: ThemePreference) {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private mode without storage: the choice lasts for this page only.
    }
    apply(next);
  }

  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex items-center rounded-md border border-line bg-surface p-0.5">
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = preference === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => choose(value)}
            className={`inline-flex h-6 w-7 items-center justify-center rounded-[5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] ${
              active ? "bg-panel text-fg shadow-[0_0_0_1px_var(--line-strong)]" : "text-fg-3 hover:text-fg"
            }`}
          >
            <Icon size={14} />
          </button>
        );
      })}
    </div>
  );
}

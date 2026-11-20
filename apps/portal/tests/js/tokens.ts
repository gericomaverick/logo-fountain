// Reads the colour and type tokens out of resources/css/app.css (the single token file) and
// computes WCAG 2.x contrast. Used by the unit tests; no dependencies (node:test, Node 24).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const APP_CSS = fileURLToPath(new URL('../../resources/css/app.css', import.meta.url));

export type Tokens = Record<string, string>;

function block(css: string, opener: RegExp): string {
    const m = opener.exec(css);
    if (!m) throw new Error(`token block not found: ${opener}`);
    const start = m.index + m[0].length;
    let depth = 1;
    for (let i = start; i < css.length; i++) {
        if (css[i] === '{') depth++;
        if (css[i] === '}' && --depth === 0) return css.slice(start, i);
    }
    throw new Error(`unterminated block: ${opener}`);
}

function vars(body: string, prefix: string): Tokens {
    const out: Tokens = {};
    for (const m of body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
        const [, name, value] = m as unknown as [string, string, string];
        if (name.startsWith(prefix) && !value.includes('initial')) out[name.slice(prefix.length)] = value.trim().toLowerCase();
    }
    return out;
}

export function readTokens(css = readFileSync(APP_CSS, 'utf8')) {
    const theme = block(css, /@theme static\s*\{/);
    return {
        light: vars(theme, 'color-'),
        dark: vars(block(css, /:root\[data-theme='dark'\]\s*\{/), 'color-'),
        darkNoScript: vars(block(css, /:root:not\(\[data-theme\]\)\s*\{/), 'color-'),
        text: vars(theme, 'text-'),
    };
}

function channel(v: number): number {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
    const m = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!m) throw new Error(`not a #rrggbb colour: ${hex}`);
    const n = parseInt(m[1] as string, 16);
    return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrast(a: string, b: string): number {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
    return (hi + 0.05) / (lo + 0.05);
}

/** Evaluates `clamp(Arem, Brem + Cvw, Drem)` at a viewport width, in px (16 px root). */
export function clampPx(value: string, viewport: number): number {
    const m = /^clamp\(([\d.]+)rem,\s*([\d.]+)rem \+ ([\d.]+)vw,\s*([\d.]+)rem\)$/.exec(value);
    if (!m) throw new Error(`not a fluid clamp(): ${value}`);
    const [min, base, vw, max] = m.slice(1).map(Number) as [number, number, number, number];
    return Math.min(max * 16, Math.max(min * 16, base * 16 + (vw * viewport) / 100));
}

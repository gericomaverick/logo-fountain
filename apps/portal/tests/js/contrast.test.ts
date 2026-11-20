// UX §8.1: every verified text/background pair, computed from the token values in
// resources/css/app.css (story 1.7, NFR-A4). Run: npm run test:unit
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { clampPx, contrast, readTokens } from './tokens.ts';

const { light, dark, darkNoScript, text } = readTokens();

// The §8.1 table, value for value (direction A, "final for A" per §15).
const SPEC: Record<string, [string, string]> = {
    bg: ['#fbf9f4', '#121211'],
    surface: ['#ffffff', '#1b1b19'],
    sunken: ['#f3eee3', '#0c0c0b'],
    divider: ['#e7e1d5', '#2a2926'],
    border: ['#857e6f', '#77726a'],
    fg: ['#151412', '#f2efe8'],
    'fg-2': ['#4a4740', '#c2bdb2'],
    'fg-3': ['#6b675e', '#9b968b'],
    accent: ['#5150f7', '#8e8dff'],
    'accent-fg': ['#ffffff', '#0c0c0b'],
    'accent-text': ['#4241d6', '#a3a2ff'],
    'accent-soft': ['#ecebff', '#24234a'],
    success: ['#17704a', '#4cc38a'],
    'success-soft': ['#e6f4ec', '#12301f'],
    warning: ['#8a5300', '#e7a93b'],
    'warning-soft': ['#fbf0dc', '#33270f'],
    danger: ['#b42318', '#f97066'],
    'danger-soft': ['#fdecea', '#3a1714'],
};

type Pair = { fg: string; bg: string; min: number; light?: number; dark?: number };
const TEXT = 4.5;
const UI = 3;

// [foreground, background, minimum, documented light ratio, documented dark ratio]
const PAIRS: Pair[] = [
    { fg: 'border', bg: 'bg', min: UI, light: 3.83, dark: 3.93 },
    { fg: 'border', bg: 'surface', min: UI, light: 4.03, dark: 3.61 },
    { fg: 'border', bg: 'sunken', min: UI, light: 3.48 },
    ...(['fg', 'fg-2', 'fg-3', 'accent-text'] as const).flatMap((fg) => {
        const doc: Record<string, [number, number][]> = {
            fg: [[17.5, 16.3], [18.4, 15.0], [15.9, 17.0]],
            'fg-2': [[8.8, 10.0], [9.3, 9.2], [8.0, 10.5]],
            'fg-3': [[5.4, 6.4], [5.6, 5.9], [4.9, 6.6]],
            'accent-text': [[6.8, 8.2], [7.1, 7.5], [6.1, 8.6]],
        };
        return (['bg', 'surface', 'sunken'] as const).map((bg, i) => {
            const [l, d] = (doc[fg] as [number, number][])[i] as [number, number];
            return { fg, bg, min: TEXT, light: l, dark: d };
        });
    }),
    { fg: 'accent-fg', bg: 'accent', min: TEXT, light: 5.5, dark: 6.9 },
    { fg: 'accent-text', bg: 'accent-soft', min: TEXT, light: 6.1, dark: 6.5 },
    { fg: 'success', bg: 'success-soft', min: TEXT, light: 5.4, dark: 6.5 },
    { fg: 'warning', bg: 'warning-soft', min: TEXT, light: 5.6, dark: 7.1 },
    { fg: 'danger', bg: 'danger-soft', min: TEXT, light: 5.8, dark: 5.7 },
    // §13: the 2 px accent focus outline needs ≥ 3:1 against the surfaces it sits on.
    { fg: 'accent', bg: 'bg', min: UI },
    { fg: 'accent', bg: 'surface', min: UI },
    { fg: 'accent', bg: 'sunken', min: UI },
];

// §8.1 rounds to one decimal, and two entries round up by 0.05 (6.05 → 6.1, 5.75 → 5.8).
const ROUNDING = 0.06;

describe('WCAG contrast maths', () => {
    test('matches the reference values', () => {
        assert.equal(contrast('#000000', '#ffffff'), 21);
        assert.equal(contrast('#ffffff', '#ffffff'), 1);
        assert.equal(contrast('#767676', '#ffffff').toFixed(2), '4.54'); // the classic AA grey
        assert.ok(contrast('#777777', '#ffffff') < TEXT);
    });
});

describe('UX §8.1 colour tokens', () => {
    test('app.css has exactly the §8.1 token set, light and dark', () => {
        assert.deepEqual(Object.keys(light).sort(), Object.keys(SPEC).sort());
        for (const [name, [l, d]] of Object.entries(SPEC)) {
            assert.equal(light[name], l, `light ${name}`);
            assert.equal(dark[name], d, `dark ${name}`);
        }
    });

    test('the no-script dark block matches the data-theme dark block', () => {
        assert.deepEqual(darkNoScript, dark);
    });

    for (const [theme, tokens] of [['light', light], ['dark', dark]] as const) {
        for (const p of PAIRS) {
            const documented = p[theme];
            test(`${theme}: ${p.fg} on ${p.bg} ≥ ${p.min}:1${documented ? ` (§8.1 says ${documented})` : ''}`, () => {
                const ratio = contrast(tokens[p.fg] as string, tokens[p.bg] as string);
                assert.ok(ratio >= p.min, `${ratio.toFixed(2)} < ${p.min}`);
                if (documented !== undefined) {
                    assert.ok(Math.abs(ratio - documented) <= ROUNDING, `computed ${ratio.toFixed(3)} vs documented ${documented}`);
                }
            });
        }
    }
});

describe('UX §8.2 display sizes', () => {
    // DisplayTitle uses text-3xl, and text-4xl from lg. Sfizia needs ≥ 28 px on phones, ≥ 32 px on desktop.
    test('text-3xl is at least 28 px at 320/390 px and at least 32 px at 1024/1280 px', () => {
        const size = text['3xl'] as string;
        for (const w of [320, 390]) assert.ok(clampPx(size, w) >= 28, `phone ${w}px: ${clampPx(size, w)}`);
        for (const w of [1024, 1280]) assert.ok(clampPx(size, w) >= 32, `desktop ${w}px: ${clampPx(size, w)}`);
    });

    test('text-base never drops below 16 px (stops iOS input zoom)', () => {
        assert.ok(clampPx(text.base as string, 320) >= 16);
    });
});

// Story 1.8a: pairs the form and action primitives use that §8.1 doesn't list (proposed as a §8.1
// addendum in the story record). Same thresholds: 4.5:1 for text, 3:1 for icons and boundaries.
describe('story 1.8a component pairs (beyond the §8.1 table)', () => {
    const mix = (fg: string, bg: string, alpha: number) => {
        const ch = (h: string, i: number) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16);
        return `#${[0, 1, 2].map((i) => Math.round(ch(fg, i) * alpha + ch(bg, i) * (1 - alpha)).toString(16).padStart(2, '0')).join('')}`;
    };
    const EXTRA: Array<[string, string, number, string]> = [
        ['fg', 'accent-soft', TEXT, 'InlineAlert info body'],
        ['fg', 'success-soft', TEXT, 'InlineAlert success body'],
        ['fg', 'warning-soft', TEXT, 'InlineAlert warning body'],
        ['fg', 'danger-soft', TEXT, 'InlineAlert danger body, ErrorSummary'],
        ['danger', 'bg', TEXT, 'Field error text on the page'],
        ['danger', 'surface', TEXT, 'Field error text in a card or dialog, danger menu item'],
        ['accent-fg', 'danger', TEXT, 'danger Button label'],
        ['accent-fg', 'accent-text', TEXT, 'primary Button label on hover'],
        ['success', 'surface', UI, 'success Toast icon'],
        ['danger', 'surface', UI, 'invalid control border, error Toast icon'],
        ['accent', 'accent-soft', UI, 'selected Choice chip border'],
        ['fg-2', 'sunken', UI, 'read-only checked Checkbox/Radio fill'],
    ];
    for (const [theme, tokens] of [['light', light], ['dark', dark]] as const) {
        for (const [fg, bg, min, use] of EXTRA) {
            test(`${theme}: ${fg} on ${bg} ≥ ${min}:1 (${use})`, () => {
                const ratio = contrast(tokens[fg] as string, tokens[bg] as string);
                assert.ok(ratio >= min, `${ratio.toFixed(2)} < ${min}`);
            });
        }
        test(`${theme}: danger Button hover (danger at 90% over surface) keeps its label ≥ 4.5:1`, () => {
            const hover = mix(tokens.danger as string, tokens.surface as string, 0.9);
            assert.ok(contrast(tokens['accent-fg'] as string, hover) >= TEXT);
        });
    }
});

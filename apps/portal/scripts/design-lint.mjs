#!/usr/bin/env node
// L7b design-system lint (story 1.7; story 1.9 added font-size and gradient; UX §6 rules, §8,
// §16; 02-test-strategy L7b). Runs in bin/ui-test and so in the CI ui job.
//
//   display-font   The display font token (Tailwind class `font-display`, `--font-display`,
//                  or the family name Sfizia) only in Components/ui/DisplayTitle.tsx, plus its
//                  definition and @font-face in the token file.
//   display-title  DisplayTitle is rendered only by the allowlisted files (the three uses in
//                  UX §8.2), and never by admin code.
//   raw-colour     No raw hex/rgb/hsl/oklch colours or Tailwind palette names (white, black,
//                  gray-500...) outside the token file. Use the semantic tokens.
//   font-size      No raw font sizes outside the token file: Tailwind arbitrary sizes
//                  (text-[14px], text-[0.9rem], text-[length:...]), style objects
//                  (fontSize: 14 / '14px') or CSS font-size with a literal length. Use the
//                  fluid scale text-xs … text-2xl (UX §8.2).
//   gradient       No ad-hoc gradients outside the token file: bg-linear-*, bg-gradient-to-*,
//                  bg-radial*, bg-conic*, or a CSS *-gradient(). A needed pattern becomes a
//                  token-built @utility in app.css (as bg-stripes-in-progress did, 1.8b).
//
// Not linted: "one primary button per view" (UX §11, AGENTS.md §5). A view is a runtime
// composition (page + shell + open dialog, conditional branches), so a static count per file is
// both noisy and incomplete. It is enforced in the browser instead: tests/browser/support/views.ts
// expectOnePrimary(), called by each screen's spec (story 1.9).
//
// Usage: node scripts/design-lint.mjs [root]   (exit 1 on any finding)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TOKEN_FILE = 'resources/css/app.css';
export const DISPLAY_TITLE_FILE = 'resources/js/Components/ui/DisplayTitle.tsx';
export const LAYOUT_FILE = 'resources/views/app.blade.php';

// UX §8.2 allows exactly three uses: the customer Overview project name, the auth-screen
// headline and the celebration turn banner. Home is the story 1.7 showcase standing in for
// the Overview until Epic 6. TurnBanner renders the celebration headline (story 1.8b), so screens
// get Sfizia there only through <TurnBanner celebration=…>. Adding a file here needs a matching
// UX spec change.
export const DISPLAY_TITLE_CALLERS = ['resources/js/Pages/Home.tsx', 'resources/js/Components/ui/TurnBanner.tsx'];

const SCAN_DIRS = ['resources/js', 'resources/css', 'resources/views'];
const SCAN_EXT = /\.(?:tsx?|jsx?|mjs|css|php)$/;

const DISPLAY_TOKEN = /\bfont-display\b|--font-display\b|\bsfizia\b/gi;
const HEX = /(?<![\w&])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/gi;
const COLOUR_FN = /\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color)\(/gi;
const PALETTE =
    /\b(?:bg|text|border(?:-[trblxy])?|ring|ring-offset|outline|fill|stroke|from|via|to|divide|shadow|decoration|accent|caret|placeholder)-(?:white|black|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3})\b/g;
// A literal CSS length in px/pt/rem/em (not var(), not a token).
const LENGTH = String.raw`-?(?:\d+\.?\d*|\.\d+)(?:px|pt|rem|em)`;
const FONT_SIZE = [
    // Tailwind arbitrary font sizes, with an optional variant prefix (md:text-[18px]) or type hint.
    new RegExp(String.raw`(?<![\w-])text-\[${LENGTH}(?:\/[^\]]+)?\]`, 'g'),
    new RegExp(String.raw`(?<![\w-])text-\[length:[^\]]+\]`, 'g'),
    // React style objects: fontSize: 14, fontSize: '14px', "fontSize": "1rem".
    /\bfontSize['"]?\s*:\s*['"`]?-?\d/g,
    // CSS (files, inline style strings, Blade): font-size: 14px.
    new RegExp(String.raw`\bfont-size\s*:\s*${LENGTH}`, 'g'),
];
const GRADIENT = [/(?<![\w-])bg-(?:gradient-to-[a-z]+|linear-[\w[\]-]+|radial(?:-[\w[\]-]+)?|conic(?:-[\w[\]-]+)?)/g, /\b(?:repeating-)?(?:linear|radial|conic)-gradient\(/g];
const DISPLAY_TITLE_USE = /<DisplayTitle\b|\bimport\b[^;]*\bDisplayTitle\b/;

function walk(dir, out) {
    let entries;
    try {
        entries = readdirSync(dir);
    } catch {
        return out;
    }
    for (const name of entries) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path, out);
        else if (SCAN_EXT.test(name)) out.push(path);
    }
    return out;
}

function lineOf(text, index) {
    return text.slice(0, index).split('\n').length;
}

// In the token file, the display token may only be defined, not used.
function allowedInTokenFile(line) {
    return /^\s*--font-display\s*:/.test(line) || /^\s*font-display\s*:\s*\w+;/.test(line) || /^\s*font-family\s*:\s*'Sfizia';/.test(line) || /^\s*src\s*:\s*url\('\.\.\/fonts\/sfizia\//.test(line) || /^\s*(?:\/?\*|\/\/)/.test(line);
}

export function lint(root) {
    const findings = [];
    const add = (file, text, index, rule, message) => findings.push({ file, line: lineOf(text, index), rule, message });
    const files = SCAN_DIRS.flatMap((d) => walk(join(root, d), []));

    for (const abs of files) {
        const file = relative(root, abs).split(sep).join('/');
        const text = readFileSync(abs, 'utf8');
        const lines = text.split('\n');
        const isTokenFile = file === TOKEN_FILE;
        const isDisplayTitle = file === DISPLAY_TITLE_FILE;

        for (const m of text.matchAll(DISPLAY_TOKEN)) {
            if (isDisplayTitle) continue;
            const line = lines[lineOf(text, m.index) - 1] ?? '';
            if (isTokenFile && allowedInTokenFile(line)) continue;
            // The root layout may preload the font file (UX §8.2: only on pages that use it).
            if (file === LAYOUT_FILE && /rel="preload"|^\s*\{\{--/.test(line)) continue;
            add(file, text, m.index, 'display-font', `"${m[0]}": the display font is only available via <DisplayTitle> (UX §8.2)`);
        }

        if (!isDisplayTitle && /\.[jt]sx?$/.test(file) && DISPLAY_TITLE_USE.test(text)) {
            const index = text.search(DISPLAY_TITLE_USE);
            if (/(^|\/)admin(\/|$)/i.test(file)) {
                add(file, text, index, 'display-title', 'DisplayTitle is never used in the admin UI (UX §8.2)');
            } else if (!DISPLAY_TITLE_CALLERS.includes(file)) {
                add(file, text, index, 'display-title', 'DisplayTitle is allowed in three places only (UX §8.2); see DISPLAY_TITLE_CALLERS');
            }
        }

        if (!isTokenFile) {
            for (const re of [HEX, COLOUR_FN, PALETTE]) {
                for (const m of text.matchAll(re)) {
                    add(file, text, m.index, 'raw-colour', `"${m[0]}": use a semantic colour token (UX §6 rule 1, §8.1)`);
                }
            }
            for (const re of FONT_SIZE) {
                for (const m of text.matchAll(re)) {
                    add(file, text, m.index, 'font-size', `"${m[0]}": use a type-scale token, text-xs … text-2xl (UX §8.2)`);
                }
            }
            for (const re of GRADIENT) {
                for (const m of text.matchAll(re)) {
                    add(file, text, m.index, 'gradient', `"${m[0]}": no ad-hoc gradients; add a token-built @utility to app.css (UX §8, §16)`);
                }
            }
        }
    }
    return findings;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const root = process.argv[2] ?? fileURLToPath(new URL('..', import.meta.url));
    const findings = lint(root);
    for (const f of findings) console.error(`${f.file}:${f.line}  ${f.rule}  ${f.message}`);
    console.log(findings.length ? `design lint: ${findings.length} finding(s)` : 'design lint: clean');
    process.exit(findings.length ? 1 : 0);
}

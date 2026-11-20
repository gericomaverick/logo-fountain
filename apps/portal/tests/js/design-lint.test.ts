// The L7b design lint (scripts/design-lint.mjs): the real tree is clean, and each rule fires
// on a fixture tree. Run: npm run test:unit
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { lint } from '../../scripts/design-lint.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'design-lint-'));
after(() => rmSync(tmp, { recursive: true, force: true }));

type Finding = { file: string; line: number; rule: string; message: string };

function tree(name: string, files: Record<string, string>): Finding[] {
    const root = join(tmp, name);
    for (const [path, body] of Object.entries(files)) {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), body);
    }
    return lint(root) as Finding[];
}

const rules = (f: Finding[]) => f.map((x) => `${x.file}:${x.rule}`).sort();

describe('design lint (L7b)', () => {
    test('the portal source is clean', () => {
        assert.deepEqual(lint(ROOT), []);
    });

    test('rejects the display font token outside DisplayTitle', () => {
        const f = tree('display', {
            'resources/js/Components/ui/DisplayTitle.tsx': '<h1 className="font-display text-3xl" />',
            'resources/js/Pages/Settings.tsx': '<h2 className="font-display text-lg">Account</h2>',
            'resources/js/Components/ui/Card.tsx': "const s = { fontFamily: 'var(--font-display)' };",
            'resources/js/Components/ui/Hero.tsx': "const s = { fontFamily: 'Sfizia, serif' };",
            'resources/css/app.css': [
                "  --font-display: 'Sfizia', Georgia, serif;",
                '  font-display: swap;',
                "  font-family: 'Sfizia';",
                '.title { font-family: var(--font-display); }',
                '.h { @apply font-display; }',
            ].join('\n'),
        });
        assert.deepEqual(rules(f), [
            'resources/css/app.css:display-font',
            'resources/css/app.css:display-font',
            'resources/js/Components/ui/Card.tsx:display-font',
            'resources/js/Components/ui/Hero.tsx:display-font',
            'resources/js/Pages/Settings.tsx:display-font',
        ]);
        assert.deepEqual(
            f.filter((x) => x.file.endsWith('app.css')).map((x) => x.line),
            [4, 5],
        );
    });

    test('limits DisplayTitle to the allowlisted uses and never in admin', () => {
        const f = tree('callers', {
            'resources/js/Pages/Home.tsx': "import { DisplayTitle } from '@/Components/ui/DisplayTitle';",
            'resources/js/Pages/Concepts.tsx': "import { DisplayTitle } from '@/Components/ui/DisplayTitle';",
            'resources/js/Pages/Admin/Queue.tsx': "import { DisplayTitle } from '@/Components/ui/DisplayTitle';",
        });
        assert.deepEqual(rules(f), ['resources/js/Pages/Admin/Queue.tsx:display-title', 'resources/js/Pages/Concepts.tsx:display-title']);
        assert.match(f.find((x) => x.file.includes('Admin'))?.message ?? '', /admin/);
    });

    test('rejects raw colours outside the token file', () => {
        const f = tree('colours', {
            'resources/css/app.css': '--color-bg: #fbf9f4;',
            'resources/js/Components/ui/A.tsx': '<div className="bg-[#5150F7] text-white" />',
            'resources/js/Components/ui/B.tsx': "const s = { color: 'rgb(0 0 0)', border: '1px solid #ccc' };",
            'resources/js/Components/ui/C.tsx': '<p className="text-gray-500 border-slate-200">ok</p>',
            'resources/js/Components/ui/D.tsx': '<a href="#main" className="bg-surface text-fg">fine</a>',
        });
        assert.deepEqual(rules(f), [
            'resources/js/Components/ui/A.tsx:raw-colour',
            'resources/js/Components/ui/A.tsx:raw-colour',
            'resources/js/Components/ui/B.tsx:raw-colour',
            'resources/js/Components/ui/B.tsx:raw-colour',
            'resources/js/Components/ui/C.tsx:raw-colour',
            'resources/js/Components/ui/C.tsx:raw-colour',
        ]);
    });

    test('rejects raw font sizes outside the token file (story 1.9)', () => {
        const f = tree('font-size', {
            'resources/css/app.css': '--text-base: clamp(1rem, 0.963rem + 0.1852vw, 1.125rem);\nbody { font-size: 16px; }',
            'resources/js/Components/ui/A.tsx': '<p className="text-[14px] md:text-[1.1rem]">x</p>',
            'resources/js/Layouts/B.tsx': "const s = { fontSize: 13 }; const t = { fontSize: '0.8rem' };",
            'resources/js/Pages/C.tsx': '<p style="font-size: 12px" className="text-[length:var(--x)]">x</p>',
            'resources/css/extra.css': '.x { font-size: 0.75em; } .y { font-size: var(--text-sm); }',
            'resources/views/mail.blade.php': '<td style="font-size:14pt">x</td>',
            'resources/js/Components/ui/Ok.tsx': '<p className="text-sm md:text-base text-fg-2 text-[var(--text-lg)]">fine</p>; <Icon size={20} />',
        });
        assert.deepEqual(rules(f), [
            'resources/css/extra.css:font-size',
            'resources/js/Components/ui/A.tsx:font-size',
            'resources/js/Components/ui/A.tsx:font-size',
            'resources/js/Layouts/B.tsx:font-size',
            'resources/js/Layouts/B.tsx:font-size',
            'resources/js/Pages/C.tsx:font-size',
            'resources/js/Pages/C.tsx:font-size',
            'resources/views/mail.blade.php:font-size',
        ]);
    });

    test('rejects ad-hoc gradients outside the token file (story 1.9)', () => {
        const f = tree('gradient', {
            'resources/css/app.css': '@utility bg-stripes { background-image: repeating-linear-gradient(135deg, var(--color-accent) 0 3px, var(--color-accent-soft) 3px 6px); }',
            'resources/js/Components/ui/A.tsx': '<div className="bg-linear-to-r from-accent to-accent-soft" />',
            'resources/js/Components/ui/B.tsx': '<div className="bg-gradient-to-b bg-radial-[at_50%_50%] bg-conic" />',
            'resources/js/Layouts/C.tsx': "const s = { backgroundImage: 'linear-gradient(var(--color-bg), var(--color-surface))' };",
            'resources/js/Components/ui/Ok.tsx': '<div className="bg-surface bg-stripes-in-progress bg-accent-soft" />',
        });
        assert.deepEqual(rules(f), [
            'resources/js/Components/ui/A.tsx:gradient',
            'resources/js/Components/ui/B.tsx:gradient',
            'resources/js/Components/ui/B.tsx:gradient',
            'resources/js/Components/ui/B.tsx:gradient',
            'resources/js/Layouts/C.tsx:gradient',
        ]);
    });
});

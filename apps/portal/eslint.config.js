// ESLint (L0 for the Inertia/React front end; story 1.9, 02-test-strategy L0/L7b). Minimal on
// purpose: the recommended sets of ESLint, typescript-eslint (no type-aware rules; tsc covers
// types), React hooks (incl. the React Compiler rules) and jsx-a11y. The design-system rules
// (colours, sizes, gradients, display font) live in scripts/design-lint.mjs. Run: npm run lint
// (bin/ui-test). Warnings fail too (--max-warnings=0).
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default defineConfig(
    {
        ignores: ['vendor/**', 'node_modules/**', 'public/**', 'storage/**', 'bootstrap/cache/**', 'playwright-report/**', 'test-results/**', 'tests/lighthouse/**'],
    },
    js.configs.recommended,
    tseslint.configs.recommended,
    {
        files: ['resources/js/**/*.{ts,tsx}'],
        extends: [reactHooks.configs.flat['recommended-latest'], jsxA11y.flatConfigs.recommended],
    },
    {
        // Node scripts (plain JS, so no-undef applies): Node's globals.
        files: ['**/*.mjs', 'eslint.config.js'],
        languageOptions: { globals: { process: 'readonly', console: 'readonly', URL: 'readonly' } },
    },
    {
        rules: {
            // `_`-prefixed names are deliberately unused (destructuring out a prop, test doubles).
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
        },
    },
);

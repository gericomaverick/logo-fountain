import { defineConfig, devices } from '@playwright/test';

// Laravel-only browser checks (L7 visual / L7a axe, 02-test-strategy). They drive a running
// portal stack: PORTAL_BASE_URL (default http://localhost:8080). Run in the pinned Playwright
// image via bin/browser-test. The behavioural parity suite stays in tests/parity.
export default defineConfig({
    testDir: './tests/browser',
    fullyParallel: true,
    forbidOnly: Boolean(process.env.CI),
    retries: 0,
    reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
    // L7 baselines (story 1.8a): generated in the pinned Playwright image (bin/browser-test), so
    // fonts and rendering match CI. Update deliberately: bin/browser-test --update-snapshots.
    expect: { toHaveScreenshot: { animations: 'disabled', caret: 'hide', scale: 'css' } },
    snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}{ext}',
    use: {
        baseURL: process.env.PORTAL_BASE_URL ?? 'http://localhost:8080',
        trace: 'retain-on-failure',
    },
    projects: [
        { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
        // hasTouch makes (pointer: coarse) match, so the 44 px touch targets (UX §13) are what gets checked.
        { name: 'phone', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: false, hasTouch: true } },
    ],
});

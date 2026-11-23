// Story 4.9b: auth screens. Gate: @auth @ui @visual. Baselines are generated, not approved (owner approves).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const SCREENS = [
    ['login', '/login', 'Sign in'],
    ['forgot-password', '/forgot-password', 'Reset your password'],
    ['set-password', '/set-password', 'Set your password'],
    ['reset-password', '/reset-password', 'Reset your password'],
    ['callback', '/auth/callback', 'Complete sign-in'],
] as const;

for (const [name, path, heading] of SCREENS) {
    test(`@visual @ui ${name}: baseline and axe`, async ({ page }) => {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        const results = await new AxeBuilder({ page }).analyze();
        expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
        await expect(page).toHaveScreenshot(`${name}.png`);
    });
}

test('@auth callback strips the token from the URL and does not confirm by itself', async ({ page }) => {
    let posted = false;
    await page.route('**/api/auth/magic-link/verify', (r) => {
        posted = true;
        return r.fulfill({ status: 200, json: { ok: true } });
    });
    await page.goto('/auth/callback#token=SECRET&next=%2Fdashboard');
    await expect(page.getByRole('button', { name: 'Confirm sign-in' })).toBeVisible();
    await expect.poll(() => page.url()).not.toContain('SECRET');
    expect(await page.evaluate(() => document.body.innerHTML.includes('SECRET'))).toBe(false);
    expect(posted).toBe(false);
    // Inertia must never have seen the fragment: not in its history state either (B1).
    expect(await page.evaluate(() => JSON.stringify(history.state))).not.toContain('SECRET');
    await page.waitForTimeout(2500);
    expect(await page.evaluate(() => JSON.stringify(history.state) + location.href)).not.toContain('SECRET');
});

for (const path of ['/reset-password', '/set-password']) {
    test(`@auth ${path} keeps the token out of the URL and history state`, async ({ page }) => {
        await page.goto(`${path}#token=SECRET`);
        await expect(page.getByLabel('New password', { exact: true })).toBeVisible();
        await page.waitForTimeout(2500);
        expect(await page.evaluate(() => JSON.stringify(history.state) + location.href)).not.toContain('SECRET');
    });
}

test('@auth callback without a token says the link is missing', async ({ page }) => {
    await page.goto('/auth/callback');
    await page.getByRole('button', { name: 'Confirm sign-in' }).click();
    await expect(page.getByText('This sign-in link is missing or expired.')).toBeVisible();
});

test('@auth login shows client validation messages', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText('Enter your email address.').first()).toBeVisible();
    await expect(page.getByText('Enter your password.').first()).toBeVisible();
});

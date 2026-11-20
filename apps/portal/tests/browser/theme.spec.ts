// Story 1.7: theme and design tokens in the browser (C-19, NFR-A4, UX §8). Gate: @visual.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const LIGHT_BG = 'rgb(251, 249, 244)'; // --color-bg light #FBF9F4
const DARK_BG = 'rgb(18, 18, 17)'; // --color-bg dark #121211

type FirstFrame = { theme: string | undefined; bg: string; body: string };

/**
 * Records the theme and background at the first animation frame, i.e. just before the first
 * paint (a frame isn't rendered until render-blocking CSS has loaded). Runs before any page script.
 */
async function recordFirstFrame(page: Page, storedPreference?: string) {
    await page.addInitScript((pref) => {
        if (pref) localStorage.setItem('lf-theme', pref);
        requestAnimationFrame(() => {
            const root = document.documentElement;
            (window as unknown as { __firstFrame: FirstFrame }).__firstFrame = {
                theme: root.dataset.theme,
                bg: getComputedStyle(root).backgroundColor,
                body: document.body ? getComputedStyle(document.body).backgroundColor : 'no body',
            };
        });
    }, storedPreference);
}

const firstFrame = (page: Page) =>
    page.waitForFunction(() => (window as unknown as { __firstFrame?: FirstFrame }).__firstFrame).then((h) => h.jsonValue() as Promise<FirstFrame>);

test.describe('NFR-A4 first paint follows the theme @visual', () => {
    test('C-19 system dark: the first paint is dark @visual', async ({ page }) => {
        await page.emulateMedia({ colorScheme: 'dark' });
        await recordFirstFrame(page);
        await page.goto('/');
        expect(await firstFrame(page)).toEqual({ theme: 'dark', bg: DARK_BG, body: expect.any(String) });
    });

    test('C-19 system light: the first paint is light @visual', async ({ page }) => {
        await page.emulateMedia({ colorScheme: 'light' });
        await recordFirstFrame(page);
        await page.goto('/');
        expect(await firstFrame(page)).toMatchObject({ theme: 'light', bg: LIGHT_BG });
    });

    test('C-19 a stored choice beats the system preference before first paint @visual', async ({ page }) => {
        await page.emulateMedia({ colorScheme: 'dark' });
        await recordFirstFrame(page, 'light');
        await page.goto('/');
        expect(await firstFrame(page)).toMatchObject({ theme: 'light', bg: LIGHT_BG });
    });

    test('C-19 stored dark under a light system paints dark first @visual', async ({ page }) => {
        await page.emulateMedia({ colorScheme: 'light' });
        await recordFirstFrame(page, 'dark');
        await page.goto('/');
        expect(await firstFrame(page)).toMatchObject({ theme: 'dark', bg: DARK_BG });
    });
});

test.describe('no JavaScript', () => {
    test.use({ javaScriptEnabled: false, colorScheme: 'dark' });

    test('C-19 system dark without scripts still renders dark (CSS fallback) @visual', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/);
        expect(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)).toBe(DARK_BG);
    });
});

test('C-19 the theme switcher persists the choice and System follows the OS live @visual', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    const html = page.locator('html');
    // Story 1.8a: a fieldset of native radios (Choice chips), so its role is group.
    const group = page.getByRole('group', { name: 'Theme' });
    await expect(group.getByRole('radio', { name: 'System' })).toBeChecked();

    await group.getByRole('radio', { name: 'Dark' }).click();
    await expect(html).toHaveAttribute('data-theme', 'dark');
    expect(await page.evaluate(() => localStorage.getItem('lf-theme'))).toBe('dark');

    await recordFirstFrame(page);
    await page.reload();
    expect(await firstFrame(page)).toMatchObject({ theme: 'dark', bg: DARK_BG });
    await expect(group.getByRole('radio', { name: 'Dark' })).toBeChecked();

    await group.getByRole('radio', { name: 'System' }).click();
    await expect(html).toHaveAttribute('data-theme', 'light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(html).toHaveAttribute('data-theme', 'dark');
});

test('UX §8.2 fonts are self-hosted and Sfizia appears once, via DisplayTitle, at display size @visual', async ({ page }, info) => {
    const hosts = new Set<string>();
    page.on('request', (r) => hosts.add(new URL(r.url()).hostname));
    await page.goto('/');
    // Pages resolve lazily (story 1.8a): wait for the render before reading fonts or running axe.
    await expect(page.locator('[data-display-title]')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    // No font CDN or any other third party: everything comes from the portal (or its Vite dev server).
    expect([...hosts].filter((h) => h !== 'localhost' && h !== '127.0.0.1')).toEqual([]);

    const fonts = await page.evaluate(() =>
        [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/["']/g, '')),
    );
    expect(fonts).toEqual(expect.arrayContaining(['Inter', 'Geist Mono', 'Sfizia']));

    await expect(page.locator('link[rel="preload"][as="font"][href*="sfizia"]')).toHaveCount(1);

    const title = page.locator('[data-display-title]');
    await expect(title).toHaveCount(1);
    const style = await title.evaluate((el) => {
        const s = getComputedStyle(el);
        return { family: s.fontFamily, size: parseFloat(s.fontSize), weight: s.fontWeight };
    });
    expect(style.family).toMatch(/^"?Sfizia"?,/);
    expect(style.weight).toBe('400');
    expect(style.size).toBeGreaterThanOrEqual(info.project.name === 'phone' ? 28 : 32);

    // Everything else is Inter.
    expect(await page.locator('body').evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/^"?Inter"?,/);
});

for (const colorScheme of ['light', 'dark'] as const) {
    test(`L7a the showcase has no serious axe violations (${colorScheme}) @visual`, async ({ page }) => {
        await page.emulateMedia({ colorScheme });
        await page.goto('/');
        // Pages resolve lazily (story 1.8a): wait for the render before reading fonts or running axe.
        await expect(page.locator('[data-display-title]')).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
        expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    });
}

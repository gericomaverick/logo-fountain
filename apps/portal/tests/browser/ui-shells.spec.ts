// Story 1.9: the customer and admin shells at /dev/ui/shells (UX §5, §13). Gate: @visual.
// L7 baselines per view and menu state, light and dark, 1280 and 390 px; L7a axe (no serious or
// critical issues); and the shell behaviour: skip link, landmarks, section tabs as links with
// aria-current, the "new" dot's name, the phone bottom bar and its overflow, the theme in the
// user menu, toasts mounted by the shell, the admin sidebar and properties column, one primary.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { expectOnePrimaryPerView } from './support/views';

const THEMES = ['light', 'dark'] as const;
type Theme = (typeof THEMES)[number];

const VIEWS = {
    'customer-overview': ['/dev/ui/shells?section=overview', 'Northvale Coffee'],
    'customer-concepts': ['/dev/ui/shells?section=concepts', 'Concepts'],
    'customer-projects': ['/dev/ui/shells?section=projects', 'Your projects'],
    'admin-overview': ['/dev/ui/shells/admin?section=overview', 'Northvale Coffee: Overview'],
    'admin-queue': ['/dev/ui/shells/admin?section=queue', 'Queue'],
} as const;
type View = keyof typeof VIEWS;

async function open(page: Page, view: View, theme: Theme = 'light') {
    const [url, h1] = VIEWS[view];
    await page.emulateMedia({ colorScheme: theme });
    await page.goto(url);
    // Pages load lazily (a Vite chunk per page); under load the first visit can take a few seconds.
    await expect(page.getByRole('heading', { level: 1, name: h1 })).toBeVisible({ timeout: 15_000 });
    await page.evaluate(() => document.fonts.ready);
}

async function seriousViolations(page: Page) {
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`);
}

const sections = (page: Page) => page.getByRole('navigation', { name: 'Project sections' });
const userMenuButton = (page: Page, name = 'Alex Morgan') => page.getByRole('button', { name: `${name}, account menu` });
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;

/** Menu states, each opened from a view, screenshotted as the whole viewport. */
const STATES: Record<string, { view: View; phoneOnly?: boolean; open: (page: Page) => Promise<void> }> = {
    'user-menu': {
        view: 'customer-overview',
        open: async (page) => {
            await userMenuButton(page).click();
            await expect(page.getByRole('menuitemradio', { name: 'System' })).toBeVisible();
        },
    },
    'more-menu': {
        view: 'customer-overview',
        phoneOnly: true,
        open: async (page) => {
            await sections(page).getByRole('button', { name: 'More' }).click();
            await expect(page.getByRole('menuitem', { name: 'Brief' })).toBeVisible();
        },
    },
    'admin-menu': {
        view: 'admin-queue',
        phoneOnly: true,
        open: async (page) => {
            await page.getByRole('button', { name: 'Menu', exact: true }).click();
            await expect(page.getByRole('menuitem', { name: 'Health' })).toBeVisible();
        },
    },
};

test.describe('L7 visual baselines @visual', () => {
    for (const theme of THEMES) {
        for (const view of Object.keys(VIEWS) as View[]) {
            test(`${view} (${theme}) @visual`, async ({ page }) => {
                await open(page, view, theme);
                await page.mouse.move(0, 0);
                if (!isPhone(page)) {
                    await expect(page).toHaveScreenshot(`${view}-${theme}.png`, { fullPage: true });
                    return;
                }
                // Phones: a full-page capture paints the fixed bottom bar mid-page, so take the first
                // screen and the scrolled-to-end screen instead.
                await expect(page).toHaveScreenshot(`${view}-${theme}.png`);
                await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
                await expect(page).toHaveScreenshot(`${view}-end-${theme}.png`);
            });
        }
        for (const [name, state] of Object.entries(STATES)) {
            test(`${name} (${theme}) @visual`, async ({ page }) => {
                test.skip(Boolean(state.phoneOnly) && !isPhone(page), 'phone-only control');
                await open(page, state.view, theme);
                await state.open(page);
                await expect(page).toHaveScreenshot(`${name}-${theme}.png`);
            });
        }
    }
});

test.describe('L7a accessibility @visual', () => {
    for (const theme of THEMES) {
        test(`every view and menu state has no serious axe violations (${theme}) @visual`, async ({ page }) => {
            for (const view of Object.keys(VIEWS) as View[]) {
                await open(page, view, theme);
                expect(await seriousViolations(page), view).toEqual([]);
            }
            for (const [name, state] of Object.entries(STATES)) {
                if (state.phoneOnly && !isPhone(page)) continue;
                await open(page, state.view, theme);
                await state.open(page);
                expect(await seriousViolations(page), name).toEqual([]);
            }
        });
    }
});

test.describe('Shell structure @visual', () => {
    test('the skip link is the first tab stop, shows on focus and moves focus to main @visual', async ({ page }) => {
        for (const view of ['customer-overview', 'admin-overview'] as const) {
            await open(page, view);
            await page.keyboard.press('Tab');
            const skip = page.getByRole('link', { name: 'Skip to main content' });
            await expect(skip).toBeFocused();
            const box = await skip.boundingBox();
            expect(box?.width ?? 0, view).toBeGreaterThan(24); // visible, not the 1 px sr-only box
            await page.keyboard.press('Enter');
            await expect(page.getByRole('main')).toBeFocused();
        }
    });

    test('landmarks: one banner, one main, named navs, one h1 (customer and admin) @visual', async ({ page }) => {
        for (const view of Object.keys(VIEWS) as View[]) {
            await open(page, view);
            await expect(page.getByRole('banner'), view).toHaveCount(1);
            await expect(page.getByRole('main'), view).toHaveCount(1);
            await expect(page.getByRole('heading', { level: 1 }), view).toHaveCount(1);
            const inProject = view === 'customer-overview' || view === 'customer-concepts' || view === 'admin-overview';
            await expect(sections(page), view).toHaveCount(inProject ? 1 : 0); // the hidden copy is out of the tree
        }
    });

    test('one primary button per view (UX §11) @visual', async ({ page }) => {
        for (const view of Object.keys(VIEWS) as View[]) {
            await open(page, view);
            await expectOnePrimaryPerView(page, view);
        }
    });
});

test.describe('Project section tabs @visual', () => {
    test('are links with aria-current, not ARIA tabs; the new dot is in the name and hidden itself @visual', async ({ page }) => {
        await open(page, 'customer-overview');
        const nav = sections(page);
        await expect(page.getByRole('tab')).toHaveCount(0);
        await expect(page.getByRole('tablist')).toHaveCount(0);
        await expect(nav.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
        const concepts = nav.getByRole('link', { name: 'Concepts, new' });
        await expect(concepts).toBeVisible();
        await expect(concepts).not.toHaveAttribute('aria-current');
        await expect(nav.getByRole('link', { name: 'Messages, new' })).toBeVisible();
        await expect(concepts.locator('[data-badge="new"]')).toHaveAttribute('aria-hidden', 'true');
        await expect(nav.getByRole('link', { name: 'Files', exact: true })).toBeVisible();

        await concepts.click();
        await expect(page).toHaveURL(/section=concepts$/);
        await expect(page.getByRole('heading', { level: 1, name: 'Concepts' })).toBeVisible();
        await expect(sections(page).getByRole('link', { name: 'Concepts, new' })).toHaveAttribute('aria-current', 'page');
        await expect(sections(page).getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current');
    });

    test('desktop: the top bar has all five sections, and there is no bottom bar @visual', async ({ page }) => {
        test.skip(isPhone(page), 'desktop layout');
        await open(page, 'customer-overview');
        await expect(sections(page)).toHaveAttribute('data-placement', 'top');
        await expect(sections(page).getByRole('link')).toHaveText(['Overview', 'Concepts', 'Messages', 'Brief', 'Files']);
        await expect(page.locator('nav[data-placement="bottom"]')).toBeHidden();
        await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).locator('[aria-current="page"]')).toHaveText('Northvale Coffee');
    });

    test('phone: a fixed bottom bar with four sections and More; Brief is in More and on Overview @visual', async ({ page }) => {
        test.skip(!isPhone(page), 'phone layout');
        await open(page, 'customer-overview');
        const bar = sections(page);
        await expect(bar).toHaveAttribute('data-placement', 'bottom');
        await expect(page.locator('nav[data-placement="top"]')).toBeHidden();
        await expect(bar.getByRole('link')).toHaveText(['Overview', 'Concepts', 'Messages', 'Files']);
        const box = await bar.boundingBox();
        expect(Math.round((box?.y ?? 0) + (box?.height ?? 0))).toBe(page.viewportSize()?.height);
        for (const item of await bar.getByRole('link').all()) expect((await item.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

        // The page's last content scrolls clear of the bar.
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        const last = page.getByRole('button', { name: 'Show a sample toast' });
        expect(((await last.boundingBox())?.y ?? 0) + ((await last.boundingBox())?.height ?? 0)).toBeLessThanOrEqual((await bar.boundingBox())?.y ?? 0);

        await expect(page.getByRole('main').getByRole('link', { name: 'Your brief' })).toBeVisible();
        await bar.getByRole('button', { name: 'More' }).click();
        await page.getByRole('menuitem', { name: 'Brief' }).click();
        await expect(page).toHaveURL(/section=brief$/);
        await expect(sections(page).getByRole('button', { name: 'More, Brief is open' })).toHaveAttribute('data-active', '');
        // The breadcrumb becomes a back link to the parent.
        await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Back to Northvale Coffee' })).toBeVisible();
    });

    test('keyboard: Tab walks the section links in order; Enter follows one @visual', async ({ page }) => {
        await open(page, 'customer-overview');
        const links = sections(page).getByRole('link');
        await links.first().focus();
        const expected = isPhone(page) ? ['Concepts, new', 'Messages, new', 'Files'] : ['Concepts, new', 'Messages, new', 'Brief', 'Files'];
        for (const name of expected) {
            await page.keyboard.press('Tab');
            await expect(sections(page).getByRole('link', { name, exact: true })).toBeFocused();
        }
        await page.keyboard.press('Enter');
        await expect(page).toHaveURL(/section=files$/);
    });
});

test.describe('User menu, theme and toasts @visual', () => {
    test('the theme is chosen in the user menu, which stays open; the choice is ticked and kept @visual', async ({ page }) => {
        await open(page, 'customer-overview');
        await userMenuButton(page).click();
        await expect(page.getByRole('menu')).toContainText('Signed in as alex@northvale.example');
        await expect(page.getByRole('menuitem', { name: 'Account' })).toBeVisible();
        await expect(page.getByRole('menuitem', { name: 'Invoices' })).toBeVisible();
        await expect(page.getByRole('menuitemradio', { name: 'System' })).toHaveAttribute('aria-checked', 'true');
        await page.getByRole('menuitemradio', { name: 'Dark' }).click();
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
        await expect(page.getByRole('menuitemradio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
        await page.keyboard.press('Escape');
        await expect(userMenuButton(page)).toBeFocused();
        expect(await page.evaluate(() => localStorage.getItem('lf-theme'))).toBe('dark');
    });

    test('the shell mounts the toast provider; on phones toasts sit above the bottom bar @visual', async ({ page }) => {
        await open(page, 'customer-overview');
        await page.getByRole('button', { name: 'Show a sample toast' }).click();
        const toast = page.getByRole('status').filter({ hasText: 'Saved.' });
        await expect(toast).toContainText('Success: Saved. Your designer will see it next time they look.');
        if (isPhone(page)) {
            const toastBox = await toast.boundingBox();
            const barBox = await sections(page).boundingBox();
            expect((toastBox?.y ?? 0) + (toastBox?.height ?? 0)).toBeLessThanOrEqual(barBox?.y ?? 0);
        }

        await open(page, 'admin-overview');
        await page.getByRole('button', { name: 'Show a sample toast' }).click();
        await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
    });
});

test.describe('Admin shell @visual', () => {
    test('desktop: a sidebar nav with the current area, and the properties column beside main @visual', async ({ page }) => {
        test.skip(isPhone(page), 'desktop layout');
        await open(page, 'admin-overview');
        const admin = page.getByRole('navigation', { name: 'Admin' });
        await expect(admin.getByRole('link', { name: 'Queue' })).toHaveAttribute('aria-current', 'page');
        await expect(admin.getByRole('link', { name: 'Health' })).not.toHaveAttribute('aria-current');
        await expect(page.getByRole('button', { name: 'Menu', exact: true })).toBeHidden();
        const main = await page.getByRole('main').boundingBox();
        const aside = page.getByRole('complementary', { name: 'Project properties' });
        const box = await aside.boundingBox();
        expect(box?.x ?? 0).toBeGreaterThanOrEqual((main?.x ?? 0) + (main?.width ?? 0) - 1);
        expect(Math.round(box?.width ?? 0)).toBe(360);
        await expect(sections(page).getByRole('link')).toHaveText(['Overview', 'Concepts', 'Messages', 'Brief', 'Files', 'Audit']);
        await expect(sections(page).getByRole('link', { name: 'Concepts, new' })).toBeVisible();

        await admin.getByRole('link', { name: 'Health' }).click();
        await expect(page.getByRole('heading', { level: 1, name: 'Health' })).toBeVisible();
        await expect(page.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: 'Health' })).toHaveAttribute('aria-current', 'page');
        await expect(page.getByRole('complementary')).toHaveCount(0);
    });

    test('phone: the sidebar collapses into a Menu and the properties column stacks under main @visual', async ({ page }) => {
        test.skip(!isPhone(page), 'phone layout');
        await open(page, 'admin-overview');
        await expect(page.getByRole('navigation', { name: 'Admin' })).toBeHidden();
        const main = await page.getByRole('main').boundingBox();
        const aside = await page.getByRole('complementary', { name: 'Project properties' }).boundingBox();
        expect(aside?.y ?? 0).toBeGreaterThanOrEqual((main?.y ?? 0) + (main?.height ?? 0) - 1);
        await page.getByRole('button', { name: 'Menu', exact: true }).click();
        await page.getByRole('menuitem', { name: 'Health' }).click();
        await expect(page.getByRole('heading', { level: 1, name: 'Health' })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390); // no sideways scroll (§13)
    });

    test('the admin user menu has Account, theme and Sign out, and no Invoices @visual', async ({ page }) => {
        await open(page, 'admin-queue');
        await userMenuButton(page, 'Sam Designer').click();
        await expect(page.getByRole('menuitem', { name: 'Account' })).toBeVisible();
        await expect(page.getByRole('menuitem', { name: 'Sign out' })).toBeVisible();
        await expect(page.getByRole('menuitemradio')).toHaveCount(3);
        await expect(page.getByRole('menuitem', { name: 'Invoices' })).toHaveCount(0);
    });
});

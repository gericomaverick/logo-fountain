// Story 1.8b: the status components in the /dev/ui/status catalogue (UX §2.5, §11, §13).
// Gate: @visual. L7 baselines in both themes at 1280 and 390 px (own folder, separate from
// /dev/ui's), L7a axe (no serious or critical issues), and the behaviour the spec asks for:
// status never by colour alone, turn changes announced, one display line, reduced motion.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const THEMES = ['light', 'dark'] as const;
type Theme = (typeof THEMES)[number];
const CELEBRATIONS = [
    ['first-concepts', 'Your first concepts are here'],
    ['approved', 'You’ve chosen your logo'],
    ['final-files', 'Your final files are ready'],
] as const;

async function openStatus(page: Page, theme: Theme = 'light') {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/dev/ui/status');
    await expect(page.getByRole('heading', { level: 1, name: 'UI catalogue: status' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
}

async function seriousViolations(page: Page) {
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`);
}

const celebrationSection = (page: Page) => page.getByRole('region', { name: 'Turn banner: celebration' });

async function chooseCelebration(page: Page, title: string) {
    await celebrationSection(page).getByRole('radio', { name: title }).check();
    await expect(page.locator('[data-display-title="celebration"]')).toHaveText(title);
}

test.describe('L7 visual baselines @visual', () => {
    for (const theme of THEMES) {
        test(`the status catalogue, every variant and state (${theme}) @visual`, async ({ page }) => {
            await openStatus(page, theme);
            await page.mouse.move(0, 0);
            await expect(page).toHaveScreenshot(`status-${theme}.png`, { fullPage: true });
        });

        for (const [kind, title] of CELEBRATIONS) {
            test(`celebration banner: ${kind} (${theme}) @visual`, async ({ page }) => {
                await openStatus(page, theme);
                await chooseCelebration(page, title);
                await page.evaluate(() => document.fonts.ready);
                await page.mouse.move(0, 0);
                await expect(page.locator('[data-celebration]')).toHaveScreenshot(`celebration-${kind}-${theme}.png`);
            });
        }
    }
});

test.describe('L7a accessibility @visual', () => {
    for (const theme of THEMES) {
        test(`the status catalogue has no serious axe violations (${theme}) @visual`, async ({ page }) => {
            await openStatus(page, theme);
            expect(await seriousViolations(page)).toEqual([]);
        });

        test(`every celebration has no serious axe violations (${theme}) @visual`, async ({ page }) => {
            await openStatus(page, theme);
            for (const [kind, title] of CELEBRATIONS) {
                await chooseCelebration(page, title);
                expect(await seriousViolations(page), kind).toEqual([]);
            }
        });
    }
});

test.describe('Status pill and turn banner @visual', () => {
    test('every state has a pill with text and an icon, and the turn §2.5 gives it @visual', async ({ page }) => {
        await openStatus(page);
        const pills = page.getByRole('region', { name: 'Status pill' }).locator('[data-turn]');
        await expect(pills).toHaveCount(11);
        const expected: Record<string, [string, string]> = {
            AWAITING_BRIEF: ['your-turn', 'Your turn'],
            BRIEF_SUBMITTED: ['designers-turn', 'With your designer'],
            IN_DESIGN: ['designers-turn', 'With your designer'],
            CONCEPTS_READY: ['your-turn', 'Your turn'],
            REVISIONS_IN_PROGRESS: ['designers-turn', 'With your designer'],
            AWAITING_APPROVAL: ['designers-turn', 'With your designer'],
            FINAL_FILES_READY: ['your-turn', 'Your turn'],
            DELIVERED: ['done', 'Complete'],
            ON_HOLD: ['paused', 'Paused'],
            CANCELLED: ['closed', 'Cancelled'],
            REFUNDED: ['closed', 'Refunded'],
        };
        for (const [state, [turn, label]] of Object.entries(expected)) {
            const pill = page.locator(`[data-state="${state}"] [data-turn]`);
            await expect(pill, state).toHaveAttribute('data-turn', turn);
            await expect(pill, state).toHaveText(label, { ignoreCase: true });
            await expect(pill.locator('svg[aria-hidden="true"]'), state).toHaveCount(1);
        }
    });

    test('one banner per state; your-turn banners have one primary action, paused links to messages @visual', async ({ page }) => {
        await openStatus(page);
        const region = page.getByRole('region', { name: 'Turn banner', exact: true });
        const banners = region.locator('section[data-turn]');
        await expect(banners).toHaveCount(12); // 11 states + the live demo
        for (const title of ['Your turn: tell us about your brand', 'Your turn: review your concepts', 'Your turn: your final files are ready']) {
            const banner = region.getByRole('region', { name: title }).first();
            await expect(banner.locator('button[data-variant="primary"]'), title).toHaveCount(1);
        }
        const paused = region.getByRole('region', { name: 'Paused' });
        await expect(paused.getByRole('link', { name: 'Check messages' })).toBeVisible();
        await expect(region.getByRole('region', { name: 'Approved, final files being prepared' })).toContainText('Nothing needed from you.');
        for (const name of ['Complete', 'Cancelled', 'Refunded']) await expect(region.getByRole('region', { name, exact: true }).locator('button')).toHaveCount(0);
    });

    test('a turn change after load is announced politely; the first render is not @visual', async ({ page }) => {
        await openStatus(page);
        const demo = page.locator('[data-demo="turn-change"]');
        const live = demo.locator('[aria-live="polite"]');
        await expect(live).toHaveText('');
        await demo.getByRole('button', { name: 'Change the demo turn' }).click();
        await expect(live).toHaveText('Your turn. Your turn: review your concepts');
        await expect(demo.locator('section')).toHaveAttribute('data-turn', 'your-turn');
    });

    test('the celebration headline is the only display line: Sfizia, h2, at least 32 px desktop / 28 px phone (UX §8.2) @visual', async ({ page }, info) => {
        await openStatus(page);
        for (const [, title] of CELEBRATIONS) {
            await chooseCelebration(page, title);
            await expect(page.locator('[data-display-title]')).toHaveCount(1);
            const heading = page.getByRole('heading', { level: 2, name: title, exact: true });
            const style = await heading.evaluate((el) => ({ family: getComputedStyle(el).fontFamily, size: parseFloat(getComputedStyle(el).fontSize), weight: getComputedStyle(el).fontWeight }));
            expect(style.family).toContain('Sfizia');
            expect(style.weight).toBe('400');
            expect(style.size).toBeGreaterThanOrEqual(info.project.name === 'phone' ? 28 : 32);
        }
        expect(await page.evaluate(() => document.fonts.check('16px Sfizia'))).toBe(true);
        await expect(page.locator('link[rel="preload"][as="font"][href*="sfizia"]')).toHaveCount(1);
    });
});

test.describe('Stage tracker @visual', () => {
    test('each tracker is an ordered list with one current step, stated in text @visual', async ({ page }) => {
        await openStatus(page);
        const trackers = page.getByRole('region', { name: 'Stage tracker' }).getByRole('list', { name: /^Progress/ });
        await expect(trackers).toHaveCount(11);
        for (const tracker of await trackers.all()) {
            await expect(tracker.locator('[aria-current="step"]')).toHaveCount(1);
        }
        const middle = page.getByRole('list', { name: 'Progress: Middle: revisions in progress' });
        await expect(middle.getByRole('listitem')).toHaveCount(9);
        await expect(middle.locator('[aria-current="step"]')).toContainText('Revisions in progress, Current step');
        await expect(middle.getByRole('listitem').first()).toContainText('Awaiting brief, Done');
        await expect(middle.getByRole('listitem').last()).toContainText('Delivered, Not started yet');
        await expect(middle.locator('time[datetime="2026-11-12T11:05:00Z"]')).toHaveText('12 Nov 2026');

        const approved = page.getByRole('list', { name: 'Progress: Approved, final files being prepared' });
        await expect(approved.locator('[aria-current="step"]')).toContainText('Approved, Current step');
    });

    test('terminal states stop the flow at a marker: paused, cancelled, refunded @visual', async ({ page }) => {
        await openStatus(page);
        for (const [name, kind, label] of [
            ['Terminal: on hold', 'paused', 'On hold'],
            ['Terminal: cancelled', 'cancelled', 'Cancelled'],
            ['Terminal: refunded', 'refunded', 'Refunded'],
        ] as const) {
            const list = page.getByRole('list', { name: `Progress: ${name}` });
            await expect(list.getByRole('listitem')).toHaveCount(10);
            const current = list.locator('[aria-current="step"]');
            await expect(current).toHaveAttribute('data-terminal', kind);
            await expect(current).toContainText(`${label}, Current status`);
            await expect(list.locator('[data-status="stopped"]')).toHaveCount(9);
            await expect(list).not.toContainText('Not started yet');
        }
    });

    test('responsive: vertical on phones, horizontal from md @visual', async ({ page }, info) => {
        await openStatus(page);
        const list = page.getByRole('list', { name: 'Progress (responsive)' });
        const direction = await list.evaluate((el) => getComputedStyle(el).flexDirection);
        expect(direction).toBe(info.project.name === 'phone' ? 'column' : 'row');
        expect(await page.getByRole('list', { name: /^Progress \(vertical\)/ }).first().evaluate((el) => getComputedStyle(el).flexDirection)).toBe('column');
    });
});

test.describe('Allowance meter @visual', () => {
    test('a big number, a legend in words, and a bar named by the legend @visual', async ({ page }) => {
        await openStatus(page);
        const meter = page.getByRole('group', { name: 'Revisions: 1 in progress' });
        await expect(meter).toContainText('1 left');
        await expect(meter).toContainText('of 2 revisions');
        await expect(meter.getByRole('listitem')).toHaveText(['0 used', '1 in progress', '1 left']);
        await expect(meter.getByRole('img')).toHaveAccessibleName('1 of 2 revisions left · 0 used · 1 in progress');
        await expect(meter.locator('[data-segment]')).toHaveCount(2);

        await expect(page.getByRole('group', { name: 'Revisions: none left' })).toContainText('None left');
        const unlimited = page.getByRole('group', { name: 'Concepts: unlimited' });
        await expect(unlimited).toContainText('Unlimited');
        await expect(unlimited).toContainText('3 used');
        await expect(unlimited.getByRole('img')).toHaveCount(0);
        await expect(page.getByRole('group', { name: 'Revisions: large allowance (bar)' }).locator('[data-segment]')).toHaveCount(2);
        await expect(page.getByRole('group', { name: 'Revisions: limit lowered below usage' })).toContainText('1 over the limit');
    });
});

test.describe('Empty state and skeleton @visual', () => {
    test('empty states say what will appear here @visual', async ({ page }) => {
        await openStatus(page);
        const region = page.getByRole('region', { name: 'Empty state' });
        await expect(region.getByRole('heading', { level: 3 })).toHaveCount(4);
        await expect(region).toContainText('Your concepts will appear here once your designer shares them.');
    });

    test('skeletons are one polite status each, with the blocks hidden @visual', async ({ page }) => {
        await openStatus(page);
        const region = page.getByRole('region', { name: 'Skeleton (first load only)' });
        await expect(region.getByRole('status')).toHaveText(['Loading messages…', 'Loading concepts…', 'Loading concept images…']);
        await expect(region.locator('[data-skeleton="list"] [aria-hidden="true"] > div')).toHaveCount(3);
    });

    test('skeleton motion: one fade-in, never looping; none with reduced motion (UX §8.3) @visual', async ({ page }) => {
        await openStatus(page);
        const motion = () =>
            page.locator('[data-skeleton]').evaluateAll((els) => els.map((el) => ({ name: getComputedStyle(el).animationName, count: getComputedStyle(el).animationIterationCount })));
        for (const m of await motion()) expect(m).toEqual({ name: 'fade-in', count: '1' });
        // No descendant animates either (no shimmer, no pulse).
        expect(await page.locator('[data-skeleton] *').evaluateAll((els) => els.filter((el) => getComputedStyle(el).animationName !== 'none').length)).toBe(0);

        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.reload();
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        for (const m of await motion()) expect(m.name).toBe('none');
    });
});

test('the status catalogue has one h1 @visual', async ({ page }) => {
    await openStatus(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
});

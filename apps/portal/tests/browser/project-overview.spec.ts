// Story 6.2b (C-03, FR24, FR58), 6.3 and 6.4. Gate: @ui. Drives /dev/project-overview (a fixture snapshot, no
// database) and stubs GET /api/projects/{id} with page.route, time with page.clock. Screenshots go to
// tests/browser/screens/ (not baselines: the owner looks at them).
import { expect, test, type Page } from '@playwright/test';

const ID = '00000000-0000-4000-8000-000000000001';
const TURNS: Array<[string, string, string]> = [
    ['AWAITING_BRIEF', 'your-turn', 'Start your brief'],
    ['BRIEF_SUBMITTED', 'designers-turn', ''],
    ['IN_DESIGN', 'designers-turn', ''],
    ['CONCEPTS_READY', 'your-turn', 'Review concepts'],
    ['REVISIONS_IN_PROGRESS', 'designers-turn', ''],
    ['AWAITING_APPROVAL', 'designers-turn', ''],
    ['FINAL_FILES_READY', 'your-turn', 'Download ZIP'],
    ['DELIVERED', 'done', ''],
    ['ON_HOLD', 'paused', 'Check messages'],
    ['CANCELLED', 'closed', ''],
    ['REFUNDED', 'closed', ''],
];

const banner = (page: Page) => page.locator('[data-turn]').first();
const open = async (page: Page, qs: string) => {
    await page.goto(`/dev/project-overview?${qs}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Northvale Coffee' })).toBeVisible({ timeout: 15_000 });
};
const snapshot = (status: string, revisions = 2) => ({
    snapshot: {
        id: ID,
        status,
        packageCode: 'essential',
        timeline: [],
        entitlementUsage: { concepts: { limit: 3, consumed: 2, reserved: 0, remaining: 1 }, revisions: { limit: 3, consumed: 3 - revisions, reserved: 0, remaining: revisions } },
        messages: [],
    },
});

for (const [status, turn, action] of TURNS) {
    test(`@ui overview ${status}: turn banner ${turn}${action ? `, action "${action}"` : ', no action'}`, async ({ page }) => {
        await open(page, `status=${status}`);
        await expect(banner(page)).toHaveAttribute('data-turn', turn);
        const button = banner(page).getByRole('link');
        if (action) await expect(button).toHaveText(action);
        else await expect(button).toHaveCount(0);
        await expect(page.getByRole('list', { name: 'Project progress' })).toBeVisible();
    });
}

test('@ui overview: stage tracker marks one current step; allowances show used / in progress / left', async ({ page }) => {
    await open(page, 'status=CONCEPTS_READY&revisions=1');
    const tracker = page.getByRole('list', { name: 'Project progress' });
    await expect(tracker.locator('[aria-current="step"]')).toHaveCount(1);
    await expect(tracker.locator('[data-status="done"]').first()).toBeVisible();
    const revisions = page.getByRole('group', { name: 'Revisions' });
    await expect(revisions.getByRole('img').first()).toHaveAttribute('aria-label', /1 of 3 revisions left · 2 used/);
    await expect(page.getByRole('group', { name: 'Concepts' }).getByRole('img').first()).toHaveAttribute('aria-label', /1 of 3 concepts left · 2 used/);
});

test('@ui overview: polls every 10 s, moves the banner, downloads no image', async ({ page }) => {
    await page.clock.install();
    let polls = 0;
    await page.route(`**/api/projects/${ID}`, (route) => {
        polls += 1;
        return route.fulfill({ json: snapshot(polls > 1 ? 'CONCEPTS_READY' : 'IN_DESIGN') });
    });
    const images: string[] = [];
    page.on('request', (r) => {
        if (r.resourceType() === 'image') images.push(r.url());
    });
    await open(page, 'status=IN_DESIGN');
    const before = images.length;
    await expect(banner(page)).toHaveAttribute('data-turn', 'designers-turn');
    await page.clock.runFor(10_500);
    await expect.poll(() => polls).toBeGreaterThanOrEqual(1);
    await page.clock.runFor(10_500);
    await expect(banner(page)).toHaveAttribute('data-turn', 'your-turn');
    expect(polls).toBeGreaterThanOrEqual(2);
    expect(images.length).toBe(before);
});

test('@upsell @ui upsell: shown with no revisions left, "Not now" hides it and survives a reload', async ({ page }) => {
    await open(page, 'status=CONCEPTS_READY&revisions=0');
    const panel = page.getByRole('region', { name: /./ }).filter({ hasText: '£95' });
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('£495');
    await page.getByRole('button', { name: 'Not now' }).click();
    await expect(page.getByText('£95')).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Northvale Coffee' })).toBeVisible();
    await expect(page.getByText('£95')).toHaveCount(0);
});

test('@upsell @ui purchase banner: confirming, then confirmed at the 2.5 s then 7 s polls, and it survives a refresh', async ({ page }) => {
    await page.clock.install();
    const hits: number[] = [];
    await page.route('**/api/checkout/status**', (route) => {
        hits.push(hits.length);
        return route.fulfill({ json: { fulfilled: hits.length >= 5 } });
    });
    await page.route(`**/api/projects/${ID}`, (route) => route.fulfill({ json: snapshot('CONCEPTS_READY') }));
    await page.goto('/dev/project-overview?status=CONCEPTS_READY&upsell=1&session_id=cs_test_B&kind=addon');
    const pb = page.getByTestId('purchase-banner');
    await expect(pb).toHaveAttribute('data-state', 'confirming', { timeout: 15_000 });
    await page.clock.runFor(2_600);
    await page.reload();
    await expect(pb).toHaveAttribute('data-state', 'confirming');
    await page.clock.runFor(2_600);
    await page.clock.runFor(7_100);
    await expect(pb).toHaveAttribute('data-state', 'confirmed');
});

test('@upsell @ui purchase banner schedule: after a reload the status is asked at once, again at 2.5 s, and not again until 7 s later', async ({ page }) => {
    await page.clock.install();
    let hits = 0;
    await page.route('**/api/checkout/status**', (route) => {
        hits += 1;
        return route.fulfill({ json: { fulfilled: false } });
    });
    await page.route(`**/api/projects/${ID}`, (route) => route.fulfill({ json: snapshot('CONCEPTS_READY') }));
    await page.goto('/dev/project-overview?status=CONCEPTS_READY&upsell=1&session_id=cs_test_S&kind=addon');
    const pb = page.getByTestId('purchase-banner');
    await expect(pb).toHaveAttribute('data-state', 'confirming', { timeout: 15_000 });
    await page.reload();
    await expect(pb).toHaveAttribute('data-state', 'confirming');
    hits = 0;
    await page.clock.runFor(2_600);
    await expect.poll(() => hits).toBe(1);
    await page.clock.runFor(2_600); // 5.2 s: a flat 2.5 s interval would have asked a third time by now
    await page.waitForTimeout(300);
    expect(hits).toBe(1);
    await page.clock.runFor(4_400); // 9.6 s: the 7 s wait after the 2.5 s call has ended
    await expect.poll(() => hits).toBe(2);
    await expect(pb).toHaveAttribute('data-state', 'confirming');
});

test('@upsell @ui purchase banner: three failed status calls in a row show the delayed state', async ({ page }) => {
    await page.clock.install();
    let hits = 0;
    await page.route('**/api/checkout/status**', (route) => {
        hits += 1;
        return route.fulfill({ status: 500, json: { error: 'down' } });
    });
    await page.route(`**/api/projects/${ID}`, (route) => route.fulfill({ json: snapshot('CONCEPTS_READY') }));
    await page.goto('/dev/project-overview?status=CONCEPTS_READY&upsell=1&session_id=cs_test_D&kind=upgrade');
    const pb = page.getByTestId('purchase-banner');
    await expect(pb).toHaveAttribute('data-state', 'confirming', { timeout: 15_000 });
    await page.clock.runFor(2_600);
    await expect.poll(() => hits).toBe(2);
    await expect(pb).toHaveAttribute('data-state', 'confirming'); // two failures are not enough
    await page.clock.runFor(7_100);
    await expect.poll(() => hits).toBeGreaterThanOrEqual(3);
    await expect(pb).toHaveAttribute('data-state', 'delayed');
    await expect(pb).toHaveAttribute('role', 'status');
});

for (const [name, viewport] of [['desktop', { width: 1280, height: 800 }], ['mobile', { width: 390, height: 844 }]] as const) {
    test(`@ui overview screenshot (${name})`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await open(page, 'status=CONCEPTS_READY&revisions=0');
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: `tests/browser/screens/overview-${name}.png`, fullPage: true });
    });
}

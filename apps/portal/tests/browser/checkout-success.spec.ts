// Story 5.4 AC 7-10 (K-02, K-03, DV-22). Gate: @checkout @ui @visual. The API is stubbed with page.route and time
// with page.clock; no Stripe or mail. Baselines are generated, not approved (the owner approves).
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const SESSION = 'cs_test_BROWSER1';

async function serious(page: Page) {
    const { violations } = await new AxeBuilder({ page }).analyze();
    return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id);
}

function stubStatus(page: Page, responder: (n: number) => { status: number; json?: unknown }) {
    const calls = { n: 0 };
    page.route('**/api/checkout/status**', (route) => {
        calls.n += 1;
        const { status, json } = responder(calls.n);
        return route.fulfill({ status, json: json ?? {} });
    });
    return calls;
}

test('@checkout @ui @visual success page pending: baseline and axe', async ({ page }) => {
    stubStatus(page, () => ({ status: 200, json: { fulfilled: false, status: 'PENDING' } }));
    await page.goto(`/checkout/success?session_id=${SESSION}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Confirming your payment…' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(await serious(page)).toEqual([]);
    await expect(page).toHaveScreenshot('checkout-success-pending.png');
});

test('@checkout @ui @visual continue page: baseline and axe', async ({ page }) => {
    await page.goto(`/checkout/continue?session_id=${SESSION}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Continue to your account' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(await serious(page)).toEqual([]);
    await expect(page).toHaveScreenshot('checkout-continue.png');
});

test('@checkout success: fulfilled stops polling and shows the ready copy', async ({ page }) => {
    await page.clock.install();
    const calls = stubStatus(page, (n) => ({ status: 200, json: n < 2 ? { fulfilled: false, status: 'PENDING' } : { fulfilled: true, status: 'FULFILLED' } }));
    await page.goto(`/checkout/success?session_id=${SESSION}`);
    await page.clock.runFor(2500);
    await expect(page.getByRole('heading', { level: 1, name: 'Your order is ready' })).toBeVisible();
    const seen = calls.n;
    await page.clock.runFor(30_000);
    expect(calls.n).toBe(seen);
});

/** Advance the fake clock, then give the stubbed request a real moment to settle and schedule the next poll. */
async function advance(page: Page, ms: number) {
    await page.clock.runFor(ms);
    await new Promise((resolve) => setTimeout(resolve, 150));
}

test('@checkout success: polls every 2 s, then every 10 s with the still-waiting panel and Retry', async ({ page }) => {
    await page.clock.install();
    const calls = stubStatus(page, () => ({ status: 200, json: { fulfilled: false, status: 'PENDING' } }));
    await page.goto(`/checkout/success?session_id=${SESSION}`);
    await expect.poll(() => calls.n).toBe(1); // immediate
    for (let i = 2; i <= 4; i++) {
        await advance(page, 2000);
        expect(calls.n).toBe(i); // one per 2 s
    }
    await expect(page.getByTestId('still-waiting')).toHaveCount(0);
    while (calls.n < 100) {
        const before = calls.n;
        await advance(page, 2000);
        if (calls.n === before) break; // the schedule has slowed
    }
    await advance(page, 10_000);
    await expect(page.getByTestId('still-waiting')).toBeVisible();
    const before = calls.n;
    await advance(page, 4000);
    expect(calls.n).toBe(before); // 10 s apart, not 2 s
    await advance(page, 6000);
    expect(calls.n).toBe(before + 1);
    await page.getByRole('button', { name: 'Retry now' }).click();
    await expect.poll(() => calls.n).toBeGreaterThan(before + 1);
});

test('@checkout success: polling survives a failed poll and the copy is customer-safe (DV-22)', async ({ page }) => {
    await page.clock.install();
    const calls = stubStatus(page, (n) => (n === 2 ? { status: 500, json: { error: { message: 'stripe key sk_live_x exploded' } } } : n < 4 ? { status: 200, json: { fulfilled: false, status: 'PENDING' } } : { status: 200, json: { fulfilled: true, status: 'FULFILLED' } }));
    await page.goto(`/checkout/success?session_id=${SESSION}`);
    await page.clock.runFor(3000);
    await expect(page.getByRole('alert').filter({ hasText: 'We couldn’t check your order just now. We’ll keep trying.' })).toBeVisible();
    expect(await page.locator('body').innerText()).not.toMatch(/sk_live|exploded|stripe/i);
    await page.clock.runFor(10_000);
    await expect(page.getByRole('heading', { level: 1, name: 'Your order is ready' })).toBeVisible();
    expect(calls.n).toBeGreaterThanOrEqual(4);
});

test('@checkout success: missing session id is announced', async ({ page }) => {
    await page.goto('/checkout/success');
    await expect(page.getByRole('alert').filter({ hasText: 'Missing checkout session' })).toBeVisible();
});

test('@checkout continue: send link success, failure and 429 wait text', async ({ page }) => {
    const replies = [
        { status: 200, json: { ok: true } },
        { status: 500, json: { error: { message: 'Could not send.' } } },
        { status: 429, json: { error: { message: 'Too many requests.' } }, headers: { 'retry-after': '42' } },
    ];
    let i = 0;
    await page.route('**/api/checkout/resend-magic-link', (route) => route.fulfill(replies[Math.min(i++, 2)]));
    await page.goto(`/checkout/continue?session_id=${SESSION}`);
    const button = page.getByRole('button', { name: 'Email me a sign-in link' });
    await button.click();
    await expect(page.getByRole('status').filter({ hasText: 'Sign-in link sent. Check the purchaser email inbox to continue.' })).toBeVisible();
    await button.click();
    await expect(page.getByRole('alert').filter({ hasText: 'Could not send.' })).toBeVisible();
    await button.click();
    await expect(page.getByRole('alert').filter({ hasText: 'Too many requests. Try again in 42 seconds.' })).toBeVisible();
});

test('@checkout continue: missing session id', async ({ page }) => {
    await page.goto('/checkout/continue');
    await expect(page.getByRole('alert').filter({ hasText: 'Missing session id.' })).toBeVisible();
});

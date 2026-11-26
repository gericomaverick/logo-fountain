// Story 6.7 UI half, real-stack check: no page.route stubs. Drives the sign-in, gallery and viewer against the real API
// and object storage with a seeded published concept (two versions). Skipped unless REAL_STACK_PROJECT is set
// (the seed is made by hand on the browser-test stack; see the story's "Real-stack check"). The browser maps the
// in-network storage host to the published port: REAL_S3_PORT.
import { expect, test } from '@playwright/test';

const project = process.env.REAL_STACK_PROJECT;
test.skip(!project, 'needs a seeded stack (REAL_STACK_PROJECT)');
test.use({ launchOptions: { args: [`--host-resolver-rules=MAP seaweedfs 127.0.0.1:${process.env.REAL_S3_PORT ?? '8333'}`] } });

test('@real gallery and viewer show a seeded published concept with two versions, images loaded', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('real@example.test');
    await page.getByLabel('Password').fill('Real-Pass-2026!');
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await page.waitForURL((u) => u.pathname !== '/login');

    const read = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/read-state'));
    await page.goto(`/project/${project}/concepts`);
    const list = page.getByRole('list', { name: 'Concepts' });
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await expect(list.getByRole('listitem').first()).toContainText('Concept 1');
    expect((await read).ok()).toBe(true);

    await list.getByRole('link', { name: 'Concept 1', exact: true }).click();
    await page.waitForURL(/\/concept\/[0-9a-f-]{36}$/);
    const img = page.getByRole('img', { name: 'Concept 1, version 2' });
    await expect(img).toBeVisible();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBeGreaterThan(0);
    await expect(page.getByText('Revision note · v2')).toBeVisible();
    await page.getByRole('radio', { name: /Version 1/ }).check();
    const v1 = page.getByRole('img', { name: 'Concept 1, version 1' });
    await expect.poll(() => v1.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBeGreaterThan(0);
});

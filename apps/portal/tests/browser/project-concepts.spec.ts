// Story 6.7 UI half (C-08, C-09, FR26; UX §14). Gate: @ui. Drives /dev/project-concepts and /dev/project-concept
// (fixture props, no database) and stubs the signed-image APIs with page.route. Screenshots go to tests/browser/screens/.
import { expect, test, type Page } from '@playwright/test';

import { expectOnePrimaryPerView } from './support/views';

const ID = '00000000-0000-4000-8000-000000000001';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR4nGP4z8DwHwyBNBgAAEkHCfmTbWo0AAAAAElFTkSuQmCC', 'base64');
const concept = (n: number, extra = {}) => ({ id: `c${n}`, number: n, status: 'published', notes: null, createdAt: `2026-11-0${n}T10:00:00Z`, updatedAt: '', revisionVersion: n, imageUrl: `https://img.test/c${n}.png?sig=1`, imageKey: `k${n}`, ...extra });

async function stub(page: Page, concepts: unknown[], readState = { count: 0, status: 200 }, assets: unknown[] = []) {
    await page.route('https://img.test/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    await page.route(`**/api/projects/${ID}/concepts`, (r) => r.fulfill({ json: { concepts, projectStatus: 'CONCEPTS_READY' } }));
    await page.route(`**/api/projects/${ID}/concepts/*/assets`, (r) => r.fulfill({ json: { assets } }));
    await page.route(`**/api/projects/${ID}/read-state`, (r) => {
        readState.count++;
        return r.fulfill({ status: readState.status, json: { ok: true } });
    });
}

test('@ui concepts gallery: newest first, number and version, signed images, read-state posted, dot clears', async ({ page }) => {
    const rs = { count: 0, status: 200 };
    await stub(page, [concept(1), concept(2, { status: 'approved' })], rs);
    await page.goto('/dev/project-concepts?new=1');
    const list = page.getByRole('list', { name: 'Concepts' });
    await expect(list.getByRole('listitem')).toHaveCount(2);
    await expect(list.getByRole('listitem').first()).toContainText('Concept 2');
    await expect(list.getByRole('listitem').first()).toContainText('Version 2');
    await expect(list.getByRole('listitem').first()).toContainText('Approved');
    await expect(list.getByRole('img', { name: 'Concept 1, version 1' })).toBeVisible();
    await expect.poll(() => rs.count).toBe(1);
    await expect(page.getByRole('link', { name: 'Concepts, new' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Concept 1' })).toHaveAttribute('href', `/project/${ID}/concept/c1`);
    await expectOnePrimaryPerView(page, 'gallery');
});

test('@ui concepts gallery: the dot stays when the read-state call fails', async ({ page }) => {
    await stub(page, [concept(1)], { count: 0, status: 500 });
    await page.goto('/dev/project-concepts?new=1');
    await expect(page.getByRole('list', { name: 'Concepts' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Concepts, new' }).first()).toBeVisible();
});

test('@ui concepts gallery: empty and error states', async ({ page }) => {
    await stub(page, []);
    await page.goto('/dev/project-concepts');
    await expect(page.getByRole('heading', { name: 'No concepts yet' })).toBeVisible();
    await page.unroute(`**/api/projects/${ID}/concepts`);
    await page.route(`**/api/projects/${ID}/concepts`, (r) => r.fulfill({ status: 500, json: { error: { message: 'Something went wrong.', details: { nextStep: 'Try again.' } } } }));
    await page.reload();
    await expect(page.getByText('Something went wrong. Try again.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});

const assets = [
    { version: 2, createdAt: '2026-11-05T10:00:00Z', url: 'https://img.test/v2.png?sig=1', imageKey: 'v2' },
    { version: 1, createdAt: '2026-11-02T10:00:00Z', url: 'https://img.test/v1.png?sig=1', imageKey: 'v1' },
];

test('@ui concept viewer: image, version history switches, breadcrumbs, no feedback or approve yet', async ({ page }) => {
    await stub(page, [], undefined, assets);
    await page.goto('/dev/project-concept');
    await expect(page.getByRole('heading', { level: 2, name: 'Concept 2' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Concept 2, version 2' })).toBeVisible();
    await expect(page.getByText('A bolder direction')).toBeVisible();
    await page.getByRole('radio', { name: /Version 1/ }).check();
    await expect(page.getByRole('img', { name: 'Concept 2, version 1' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Concepts' })).toBeVisible();
    await expect(page.getByRole('button', { name: /approve|revision/i })).toHaveCount(0);
    await expectOnePrimaryPerView(page, 'viewer');
});

test('@ui concept viewer: assets error shows a retry', async ({ page }) => {
    await page.route(`**/api/projects/${ID}/concepts/*/assets`, (r) => r.fulfill({ status: 404, json: { error: { message: 'Concept not found', details: { nextStep: 'Go back to the gallery.' } } } }));
    await page.goto('/dev/project-concept');
    await expect(page.getByText('Concept not found Go back to the gallery.')).toBeVisible();
});

for (const [name, viewport] of [['desktop', { width: 1280, height: 800 }], ['mobile', { width: 390, height: 844 }]] as const) {
    test(`@ui concepts screenshots (${name})`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await stub(page, [concept(1), concept(2)], undefined, assets);
        await page.goto('/dev/project-concepts?new=1');
        await expect(page.getByRole('img', { name: 'Concept 2, version 2' })).toBeVisible();
        await page.screenshot({ path: `tests/browser/screens/concepts-gallery-${name}.png`, fullPage: true });
        await page.goto('/dev/project-concept');
        await expect(page.getByRole('img', { name: 'Concept 2, version 2' })).toBeVisible();
        await page.screenshot({ path: `tests/browser/screens/concept-viewer-${name}.png`, fullPage: true });
    });
}

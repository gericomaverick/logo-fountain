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
    await page.route(`**/api/projects/${ID}/concepts/*/comments`, (r) => r.request().method() === 'GET' ? r.fulfill({ json: { comments: [] } }) : r.fulfill({ status: 500, json: { error: { message: 'unstubbed' } } }));
    await page.route(`**/api/projects/${ID}/read-state`, (r) => {
        readState.count++;
        return r.fulfill({ status: readState.status, json: { ok: true } });
    });
}

test('@ui concepts gallery: API order (by number), number and version, signed images, read-state posted, dot clears', async ({ page }) => {
    const rs = { count: 0, status: 200 };
    await stub(page, [concept(1, { status: 'approved' }), concept(2)], rs);
    await page.goto('/dev/project-concepts?new=1');
    const list = page.getByRole('list', { name: 'Concepts' });
    await expect(list.getByRole('listitem')).toHaveCount(2);
    await expect(list.getByRole('listitem').first()).toContainText('Concept 1');
    await expect(list.getByRole('listitem').first()).toContainText('Approved');
    await expect(list.getByRole('listitem').nth(1)).toContainText('Version 2');
    await expect(list.getByRole('img', { name: 'Concept 1, version 1' })).toBeVisible();
    await expect.poll(() => rs.count).toBe(1);
    await expect(page.getByRole('link', { name: 'Concepts, new' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Concept 1' })).toHaveAttribute('href', `/project/${ID}/concept/c1`);
    await expectOnePrimaryPerView(page, 'gallery');
});

test('@ui concepts gallery: three concepts show in the API order, not newest first', async ({ page }) => {
    await stub(page, [concept(1, { createdAt: '2026-11-01T10:00:00Z' }), concept(2, { createdAt: '2026-11-09T10:00:00Z' }), concept(3, { createdAt: '2026-11-05T10:00:00Z' })]);
    await page.goto('/dev/project-concepts');
    const items = page.getByRole('list', { name: 'Concepts' }).getByRole('listitem');
    await expect(items).toHaveCount(3);
    await expect(items.nth(0)).toContainText('Concept 1');
    await expect(items.nth(1)).toContainText('Concept 2');
    await expect(items.nth(2)).toContainText('Concept 3');
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

test('@ui concept viewer: image, version history switches, breadcrumbs, feedback composer, no approve yet', async ({ page }) => {
    await stub(page, [], undefined, assets);
    await page.goto('/dev/project-concept');
    await expect(page.getByRole('heading', { level: 2, name: 'Concept 2' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Concept 2, version 2' })).toBeVisible();
    await expect(page.getByText('A bolder direction')).toBeVisible();
    await page.getByRole('radio', { name: /Version 1/ }).check();
    await expect(page.getByRole('img', { name: 'Concept 2, version 1' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Concepts' })).toBeVisible();
    await expect(page.getByRole('button', { name: /approve/i })).toHaveCount(0);
    await expectOnePrimaryPerView(page, 'viewer');
});

test('@ui concept viewer: assets error shows a retry', async ({ page }) => {
    await page.route(`**/api/projects/${ID}/concepts/*/comments`, (r) => r.fulfill({ json: { comments: [] } }));
    await page.route(`**/api/projects/${ID}/concepts/*/assets`, (r) => r.fulfill({ status: 404, json: { error: { message: 'Concept not found', details: { nextStep: 'Go back to the gallery.' } } } }));
    await page.goto('/dev/project-concept');
    await expect(page.getByText('Concept not found Go back to the gallery.')).toBeVisible();
    await page.unroute(`**/api/projects/${ID}/concepts/*/assets`);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route(`**/api/projects/${ID}/concepts/*/assets`, async (r) => {
        await gate;
        await r.fulfill({ json: { assets } });
    });
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText('Concept not found Go back to the gallery.')).toHaveCount(0);
    await expect(page.getByRole('status').or(page.locator('[aria-busy="true"]')).first()).toBeVisible();
    release();
    await expect(page.getByRole('img', { name: 'Concept 2, version 2' })).toBeVisible();
});

const noted = [
    { version: 2, createdAt: '2026-11-05T10:00:00Z', url: 'https://img.test/v2.png?sig=1', imageKey: 'v2', notes: 'Tightened the mark' },
    { version: 1, createdAt: '2026-11-02T10:00:00Z', url: 'https://img.test/v1.png?sig=1', imageKey: 'v1', notes: 'First pass' },
];

test('@ui concept viewer: revision note per version; approved shows only the newest, no history', async ({ page }) => {
    await stub(page, [], undefined, noted);
    await page.goto('/dev/project-concept');
    await expect(page.getByText('Revision note · v2')).toBeVisible();
    await expect(page.getByText('Tightened the mark')).toBeVisible();
    await page.getByRole('radio', { name: /Version 1/ }).check();
    await expect(page.getByText('Revision note · v2')).toHaveCount(0);
    await expect(page.getByText('First pass')).toHaveCount(0); // v1 with a concept rationale: no designer note
    await page.goto('/dev/project-concept?status=approved');
    await expect(page.getByRole('img', { name: 'Concept 2, version 2' })).toBeVisible();
    await expect(page.getByRole('radio')).toHaveCount(0);
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

// Story 6.8 UI half (C-10, C-11; UX §3, §12). Fixture routes: /dev/project-concept?left=N&project=STATUS&status=CONCEPT_STATUS.
const COMMENT = { id: 'm1', body: 'Looks great, can the blue be darker?', createdAt: '2026-11-04T10:00:00Z', author: { id: 'u1', email: 'sam@example.com', fullName: 'Sam Rivera', isAdmin: false } };
const REPLY = { id: 'm2', body: 'Sure, on it.', createdAt: '2026-11-04T11:00:00Z', author: { id: 'a1', email: 'd@x.test', fullName: 'Dana Designer', isAdmin: true } };

async function feedbackStub(page: Page, comments: unknown[] = [COMMENT, REPLY]) {
    await stub(page, [], undefined, assets);
    await page.unroute(`**/api/projects/${ID}/concepts/*/comments`);
    const posted: { comment: unknown[]; revision: unknown[] } = { comment: [], revision: [] };
    await page.route(`**/api/projects/${ID}/concepts/*/comments`, (r) => {
        if (r.request().method() === 'GET') return r.fulfill({ json: { comments } });
        posted.comment.push(r.request().postDataJSON());
        comments = [...comments, { ...COMMENT, id: 'm3', body: (r.request().postDataJSON() as { body: string }).body }];
        return r.fulfill({ status: 201, json: { ok: true } });
    });
    return posted;
}

test('@ui feedback: thread shows comments and the revision request; one composer, preview before sending', async ({ page }) => {
    await feedbackStub(page);
    await page.goto('/dev/project-concept?left=2');
    const thread = page.getByRole('list', { name: 'Feedback on this concept' });
    await expect(thread).toContainText('Looks great, can the blue be darker?');
    await expect(thread).toContainText('Dana Designer');
    await expect(thread).toContainText('Revision requested: Make the mark bolder');
    await expect(page.getByTestId('revision-preview')).toHaveText('This uses 1 of your 3 revisions. You’ll have 1 left.');
    await expect(page.getByRole('textbox', { name: 'Your feedback' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Send comment' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Request a revision' })).toBeDisabled();
    await expectOnePrimaryPerView(page, 'feedback');
});

test('@ui feedback: a comment posts only the body, appears in the thread and the text clears', async ({ page }) => {
    const posted = await feedbackStub(page);
    await page.goto('/dev/project-concept');
    await page.getByRole('textbox', { name: 'Your feedback' }).fill('  Try a warmer red  ');
    await page.getByRole('button', { name: 'Send comment' }).click();
    await expect(page.getByText('Comment sent.')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Feedback on this concept' })).toContainText('Try a warmer red');
    await expect(page.getByRole('textbox', { name: 'Your feedback' })).toHaveValue('');
    expect(posted.comment).toEqual([{ body: 'Try a warmer red' }]);
});

test('@ui feedback: a revision request posts body and conceptId, then asks the page to refresh the snapshot', async ({ page }) => {
    await feedbackStub(page);
    const bodies: unknown[] = [];
    await page.route(`**/api/projects/${ID}/revision-requests`, (r) => {
        bodies.push(r.request().postDataJSON());
        return r.fulfill({ status: 201, json: { ok: true } });
    });
    await page.goto('/dev/project-concept');
    await page.getByRole('textbox', { name: 'Your feedback' }).fill('Bolder please');
    await page.getByRole('button', { name: 'Request a revision' }).click();
    await expect(page.getByText(/Revision requested\. Your designer/)).toBeVisible();
    expect(bodies).toEqual([{ body: 'Bolder please', conceptId: '00000000-0000-4000-8000-0000000000c1' }]);
    await expect(page.getByRole('textbox', { name: 'Your feedback' })).toHaveValue('');
});

test('@ui feedback: no revisions left blocks the request, points to the overview, comments still work', async ({ page }) => {
    await feedbackStub(page);
    await page.goto('/dev/project-concept?left=0');
    await expect(page.getByTestId('revision-preview')).toContainText('You have no revisions left');
    await expect(page.getByRole('link', { name: /Add a revision on your project overview/ })).toHaveAttribute('href', `/project/${ID}`);
    await page.getByRole('textbox', { name: 'Your feedback' }).fill('Just a comment');
    await expect(page.getByRole('button', { name: 'Request a revision' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Send comment' })).toBeEnabled();
});

test('@ui feedback: blocked by project stage and by concept status', async ({ page }) => {
    await feedbackStub(page);
    await page.goto('/dev/project-concept?project=AWAITING_APPROVAL');
    await page.getByRole('textbox', { name: 'Your feedback' }).fill('x');
    await expect(page.getByTestId('revision-preview')).toContainText('can’t be requested at this stage');
    await expect(page.getByRole('button', { name: 'Request a revision' })).toBeDisabled();
    await page.goto('/dev/project-concept?status=approved');
    await expect(page.getByText('This concept is approved, so it no longer takes feedback.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Request a revision' })).toHaveCount(0);
});

for (const [code, status, text, link] of [
    ['NO_REVISIONS_REMAINING', 400, 'You have no revisions left in your package.', true],
    ['CONCEPT_NOT_FOUND', 400, 'approved or replaced', false],
    ['INVALID_PROJECT_STATUS_TRANSITION', 400, 'moved on', false],
] as const) {
    test(`@ui feedback: ${code} shows a plain error and keeps the typed text`, async ({ page }) => {
        await feedbackStub(page);
        await page.route(`**/api/projects/${ID}/revision-requests`, (r) => r.fulfill({ status, json: { error: { code, message: 'x' } } }));
        await page.goto('/dev/project-concept');
        await page.getByRole('textbox', { name: 'Your feedback' }).fill('Keep me');
        await page.getByRole('button', { name: 'Request a revision' }).click();
        await expect(page.getByRole('alert').filter({ hasText: text })).toBeVisible();
        await expect(page.getByRole('textbox', { name: 'Your feedback' })).toHaveValue('Keep me');
        await expect(page.getByRole('link', { name: /Add a revision/ })).toHaveCount(link ? 1 : 0);
    });
}

test('@ui feedback: the thread failing to load shows a retry and the composer still works', async ({ page }) => {
    await stub(page, [], undefined, assets);
    await page.unroute(`**/api/projects/${ID}/concepts/*/comments`);
    let fail = true;
    await page.route(`**/api/projects/${ID}/concepts/*/comments`, (r) => (fail ? r.fulfill({ status: 500, json: { error: { message: 'Something went wrong.' } } }) : r.fulfill({ json: { comments: [COMMENT] } })));
    await page.goto('/dev/project-concept');
    await expect(page.getByText('Something went wrong.')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Your feedback' })).toBeVisible();
    fail = false;
    await page.getByRole('button', { name: 'Try again' }).last().click();
    await expect(page.getByRole('list', { name: 'Feedback on this concept' })).toContainText('Looks great');
});

for (const [name, size] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 390, height: 844 }]] as const) {
    test(`@ui feedback screenshots (${name})`, async ({ page }) => {
        await page.setViewportSize(size);
        await feedbackStub(page);
        await page.goto('/dev/project-concept?left=1');
        await expect(page.getByRole('list', { name: 'Feedback on this concept' })).toBeVisible();
        await page.getByRole('textbox', { name: 'Your feedback' }).fill('Could the type be a little lighter?');
        await page.screenshot({ path: `tests/browser/screens/concept-feedback-${name}.png`, fullPage: true });
    });
}

// Story 6.8 UI half, real-stack check: no page.route stubs. Posts a comment and a revision request on a seeded
// published concept through the real API and checks the thread and the allowance after a reload. Skipped unless
// REAL_STACK_PROJECT is set (hand-seeded: a CONCEPTS_READY project, one published concept, revisions limit 3, none used;
// user real@example.test). Desktop project only: it changes state, so it runs once per seed.
import { expect, test } from '@playwright/test';

const project = process.env.REAL_STACK_PROJECT;
test.skip(!project, 'needs a seeded stack (REAL_STACK_PROJECT)');

test('@real a comment and a revision request post through the real API; the thread and the allowance follow', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('real@example.test');
    await page.getByLabel('Password').fill('Real-Pass-2026!');
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await page.waitForURL((u) => u.pathname !== '/login');

    await page.goto(`/project/${project}/concepts`);
    await page.getByRole('list', { name: 'Concepts' }).getByRole('link', { name: 'Concept 1', exact: true }).click();
    await page.waitForURL(/\/concept\/[0-9a-f-]{36}$/);

    const box = page.getByRole('textbox', { name: 'Your feedback' });
    const preview = page.getByTestId('revision-preview');
    const thread = page.getByRole('list', { name: 'Feedback on this concept' });
    await expect(preview).toHaveText('This uses 1 of your 3 revisions. You’ll have 2 left.');

    await box.fill('Real stack comment');
    await page.getByRole('button', { name: 'Send comment' }).click();
    await expect(page.getByText('Comment sent.')).toBeVisible();
    await expect(thread).toContainText('Real stack comment');

    await box.fill('Real stack revision');
    await page.getByRole('button', { name: 'Request a revision' }).click();
    await expect(page.getByText(/Revision requested\. Your designer/)).toBeVisible();

    await page.reload();
    await expect(thread).toContainText('Real stack comment');
    await expect(thread).toContainText('Revision requested: Real stack revision');
    await expect(preview).toHaveText('This uses 1 of your 3 revisions. You’ll have 1 left.');
});

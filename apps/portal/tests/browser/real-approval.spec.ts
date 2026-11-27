// Story 6.9 UI half, real-stack check: no page.route stubs. Approves a seeded published concept through the real API.
// Skipped unless REAL_STACK_PROJECT is set (a CONCEPTS_READY project with a published concept; user real@example.test).
// Changes state, so it runs once per seed.
import { expect, test } from '@playwright/test';

const project = process.env.REAL_STACK_PROJECT;
test.skip(!project, 'needs a seeded stack (REAL_STACK_PROJECT)');

test('@real approving a concept goes through the real API and the page shows the final-files state', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('real@example.test');
    await page.getByLabel('Password').fill('Real-Pass-2026!');
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await page.waitForURL((u) => u.pathname !== '/login');

    await page.goto(`/project/${project}/concepts`);
    await page.getByRole('list', { name: 'Concepts' }).getByRole('link', { name: 'Concept 1', exact: true }).click();
    await page.waitForURL(/\/concept\/[0-9a-f-]{36}$/);

    await page.getByRole('button', { name: 'Approve this concept' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('checkbox').check();
    await dialog.getByRole('button', { name: 'Yes, approve this concept' }).click();
    await expect(page.getByText('This concept is approved', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve this concept' })).toHaveCount(0);

    await page.goto(`/project/${project}`);
    await expect(page.getByText(/final files|approval/i).first()).toBeVisible();
});

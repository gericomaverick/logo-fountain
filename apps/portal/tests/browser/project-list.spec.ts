// Story 6.1 (C-01, UX §5.3): the Projects list. Gate: @ui. Drives /dev/dashboard (fixture rows, no database).
// Screenshots go to tests/browser/screens/ (not baselines: the owner looks at them).
import { expect, test } from '@playwright/test';

test('@ui project list: cards with turn pills, new dots and one link each', async ({ page }, info) => {
    await page.goto('/dev/dashboard');
    await expect(page.getByRole('heading', { level: 1, name: 'Welcome, Sam' })).toBeVisible({ timeout: 15_000 });
    const list = page.getByRole('list', { name: 'Your projects' });
    await expect(list.getByRole('link')).toHaveCount(3);
    await expect(list.getByRole('link', { name: 'Northvale Coffee' })).toHaveAttribute('href', /\/project\/00000000-0000-4000-8000-000000000001$/);
    await expect(list.getByRole('link', { name: 'Your project' })).toHaveCount(1); // no brand name yet
    await expect(list.locator('[data-turn="your-turn"]')).toHaveCount(1);
    await expect(list.locator('[data-turn="designers-turn"]')).toHaveCount(1);
    await expect(list.locator('[data-turn="done"]')).toHaveCount(1);
    await expect(list.getByText('New concepts')).toBeVisible();
    await expect(list.getByText('New message')).toBeVisible();
    await expect(list.locator('[data-new]')).toHaveCount(2);
    await page.screenshot({ path: `tests/browser/screens/project-list-${info.project.name}.png`, fullPage: true });
});

test('@ui project list: a card opens its Overview URL', async ({ page }) => {
    await page.goto('/dev/dashboard');
    await page.getByRole('link', { name: 'Fernhill Bakery' }).click();
    // The fixture page is signed out, so the guard sends the visit to sign-in carrying that project as `next`.
    await expect(page).toHaveURL(/project(%2F|\/)00000000-0000-4000-8000-000000000002$/);
});

test('@ui project list: empty state', async ({ page }, info) => {
    await page.goto('/dev/dashboard?n=0');
    await expect(page.getByRole('heading', { level: 2, name: 'No projects yet' })).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: `tests/browser/screens/project-list-empty-${info.project.name}.png`, fullPage: true });
});

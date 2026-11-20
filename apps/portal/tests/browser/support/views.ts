// Story 1.9: view-level design rules that a static lint can't see, for every screen spec to call.
import { expect, type Page } from '@playwright/test';

/**
 * UX §11 / AGENTS.md §5 "one primary button per view": at most one visible primary Button
 * (`data-variant="primary"`) on the page outside dialogs, and at most one inside each open
 * dialog. A view is what's rendered right now (page + shell + any open dialog), which is why this
 * is a browser check and not part of the design lint (scripts/design-lint.mjs header).
 * Call it in each state a screen's spec reaches. Catalogue pages break the rule on purpose.
 */
export async function expectOnePrimaryPerView(page: Page, where = 'view') {
    const counts = await page.evaluate(() => {
        const visible = (el: Element) => {
            const box = (el as HTMLElement).getBoundingClientRect();
            const style = getComputedStyle(el);
            return box.width > 0 && box.height > 0 && style.visibility !== 'hidden';
        };
        const primaries = [...document.querySelectorAll('[data-variant="primary"]')].filter(visible);
        const dialogs = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].filter(visible);
        return {
            page: primaries.filter((b) => !b.closest('[role="dialog"], [role="alertdialog"]')).length,
            dialogs: dialogs.map((d) => primaries.filter((b) => d.contains(b)).length),
        };
    });
    expect(counts.page, `${where}: primary buttons outside dialogs`).toBeLessThanOrEqual(1);
    for (const [i, n] of counts.dialogs.entries()) expect(n, `${where}: primary buttons in dialog ${i + 1}`).toBeLessThanOrEqual(1);
}

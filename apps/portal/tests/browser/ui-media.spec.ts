// Story 1.8c: media and data components, Card/Panel, Tabs and usePolling in the /dev/ui/media
// catalogue (UX §5, §7, §11–§13; ADR-021/022/023; FR58). Gate: @visual. L7 baselines per section
// and per interactive state, in both themes at 1280 and 390 px; L7a axe (no serious or critical
// issues) on the page and each state; and the keyboard, focus and announcement behaviour.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

const THEMES = ['light', 'dark'] as const;
type Theme = (typeof THEMES)[number];
const SECTIONS = ['cards', 'tabs', 'concepts', 'viewer', 'files', 'uploads', 'thread', 'table', 'properties', 'polling'] as const;
const MIB = 1024 * 1024;
const CLOCK_START = Date.UTC(2026, 10, 20, 12, 0, 0);

/**
 * A fake clock. `paused` (the polling tests): timers only move when a test says so (runFor). Paused
 * time also stops Radix's focus restore and axe (both use timers), so other tests let it flow.
 */
async function openCatalogue(page: Page, theme: Theme = 'light', { paused = false } = {}) {
    await page.clock.install({ time: CLOCK_START });
    if (paused) await page.clock.pauseAt(CLOCK_START + 1000);
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/dev/ui/media');
    await expect(page.getByRole('heading', { level: 1, name: 'UI catalogue: media and data' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    // Every fixture image has decoded, so screenshots never catch a half-loaded one.
    await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
}

async function seriousViolations(page: Page) {
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`);
}

const section = (page: Page, id: string) => page.locator(`section[aria-labelledby="${id}"]`);
const interactiveDropzone = (page: Page) => page.getByRole('group', { name: 'Concept image', exact: true });

/** A file of `size` bytes for the file chooser or a drop. */
const fakeFile = (name: string, mimeType: string, size = 2048) => ({ name, mimeType, buffer: Buffer.alloc(size, 1) });

async function dragFileOver(page: Page, zone: Locator, event: 'dragenter' | 'drop', name = 'logo.gif', type = 'image/gif') {
    const dataTransfer = await page.evaluateHandle(
        ([n, t]) => {
            const dt = new DataTransfer();
            dt.items.add(new File(['GIF89a'], n, { type: t }));
            return dt;
        },
        [name, type] as const,
    );
    await zone.dispatchEvent(event, { dataTransfer });
}

/** Interactive states, each reached from the page, with what to screenshot. */
const STATES: Record<string, (page: Page) => Promise<Locator | null>> = {
    zoom: async (page) => {
        await page.getByRole('button', { name: 'Zoom' }).first().click();
        await expect(page.getByRole('dialog', { name: 'Concept 1, version 2' })).toBeVisible();
        return null; // the whole viewport
    },
    'dropzone-drag-over': async (page) => {
        const zone = interactiveDropzone(page).locator('[data-state]');
        await dragFileOver(page, zone, 'dragenter');
        await expect(zone).toHaveAttribute('data-state', 'drag-over');
        return interactiveDropzone(page);
    },
    'dropzone-rejected': async (page) => {
        const chooser = page.waitForEvent('filechooser');
        await interactiveDropzone(page).getByRole('button', { name: 'Choose a file' }).click();
        await (await chooser).setFiles(fakeFile('huge-logo.png', 'image/png', 10 * MIB + 1));
        await expect(interactiveDropzone(page).getByRole('alert')).toContainText('Files can be up to 10 MB');
        return interactiveDropzone(page);
    },
    'property-editing': async (page) => {
        await page.getByRole('button', { name: 'Edit revisions allowed' }).click();
        await expect(page.getByRole('spinbutton', { name: 'Revisions allowed' })).toBeFocused();
        return page.getByRole('region', { name: 'Properties', exact: true });
    },
    reconnecting: async (page) => {
        await page.getByRole('checkbox', { name: 'Make requests fail' }).check();
        for (let i = 0; i < 3; i++) await page.clock.runFor(2000);
        await expect(page.locator('[data-polling="reconnecting"]')).toBeVisible();
        return section(page, 'polling');
    },
};

test.describe('L7 visual baselines @visual', () => {
    for (const theme of THEMES) {
        test(`every section, every variant and state (${theme}) @visual`, async ({ page }) => {
            await openCatalogue(page, theme);
            await page.mouse.move(0, 0);
            for (const id of SECTIONS) await expect(section(page, id), id).toHaveScreenshot(`${id}-${theme}.png`);
        });

        for (const [name, reach] of Object.entries(STATES)) {
            test(`${name} (${theme}) @visual`, async ({ page }) => {
                await openCatalogue(page, theme);
                const target = await reach(page);
                await page.mouse.move(0, 0);
                await expect(target ?? page).toHaveScreenshot(`${name}-${theme}.png`);
            });
        }
    }
});

test.describe('L7a accessibility @visual', () => {
    for (const theme of THEMES) {
        test(`the page and every interactive state have no serious axe violations (${theme}) @visual`, async ({ page }) => {
            await openCatalogue(page, theme);
            expect(await seriousViolations(page), 'page').toEqual([]);
            for (const [name, reach] of Object.entries(STATES)) {
                await reach(page);
                expect(await seriousViolations(page), name).toEqual([]);
                await page.keyboard.press('Escape');
            }
        });
    }
});

test.describe('Upload dropzone @visual', () => {
    test('the limits are shown up front, for images and for the 95 MB final ZIP (DV-13) @visual', async ({ page }) => {
        await openCatalogue(page);
        const choose = interactiveDropzone(page).getByRole('button', { name: 'Choose a file' });
        await expect(choose).toHaveAccessibleDescription('PNG, JPG or WebP, up to 10 MB and 40 megapixels');
        await expect(page.getByRole('group', { name: 'Final ZIP', exact: true })).toContainText('up to 95 MB');
    });

    test('keyboard: Enter and Space open the file picker; a rejected file says why and the limit; a good one is accepted @visual', async ({ page }) => {
        await openCatalogue(page);
        const zone = interactiveDropzone(page);
        const choose = zone.getByRole('button', { name: 'Choose a file' });
        await choose.focus();

        let chooser = page.waitForEvent('filechooser');
        await page.keyboard.press('Enter');
        await (await chooser).setFiles(fakeFile('huge-logo.png', 'image/png', 10 * MIB + 1));
        const alert = zone.getByRole('alert');
        await expect(alert).toHaveText('Error: huge-logo.png is 10 MB. Files can be up to 10 MB.');
        const again = zone.getByRole('button', { name: 'Choose another file' });
        await expect(again).toHaveAccessibleDescription(/up to 10 MB and 40 megapixels.*Files can be up to 10 MB/);
        await expect(again).toBeFocused(); // the label changed; focus stayed put

        chooser = page.waitForEvent('filechooser');
        await page.keyboard.press('Space');
        await (await chooser).setFiles(fakeFile('logo.gif', 'image/gif'));
        await expect(alert).toContainText('logo.gif isn’t a PNG, JPG or WebP image');

        chooser = page.waitForEvent('filechooser');
        await page.keyboard.press('Enter');
        await (await chooser).setFiles(fakeFile('logo.png', 'image/png'));
        await expect(zone.locator('[role="alert"]')).toBeEmpty(); // hidden while empty
        await expect(zone.getByRole('status')).toHaveText('logo.png uploaded');
    });

    test('dragging shows the drop state; a dropped file of the wrong type is rejected with the rule @visual', async ({ page }) => {
        await openCatalogue(page);
        const zone = interactiveDropzone(page).locator('[data-state]');
        await dragFileOver(page, zone, 'dragenter');
        await expect(zone).toHaveAttribute('data-state', 'drag-over');
        await expect(zone).toContainText('Drop the file to upload it');
        await dragFileOver(page, zone, 'drop');
        await expect(zone).toHaveAttribute('data-state', 'error');
        await expect(interactiveDropzone(page).getByRole('alert')).toContainText('isn’t a PNG, JPG or WebP image');
    });

    test('uploading is a labelled progress bar; a server code is plain language; disabled says why @visual', async ({ page }) => {
        await openCatalogue(page);
        const bar = page.getByRole('progressbar', { name: 'Uploading final-files.zip' });
        await expect(bar).toHaveAttribute('aria-valuenow', '44');
        await expect(page.getByRole('group', { name: 'Concept image (error)' }).getByRole('alert')).toHaveText('Error: This image is over 40 megapixels. Export it smaller and retry.');
        const disabled = page.getByRole('group', { name: 'Final ZIP (disabled)' }).getByRole('button', { name: 'Choose a file' });
        await expect(disabled).toHaveAttribute('aria-disabled', 'true');
        await expect(disabled).toHaveAccessibleDescription(/Approve a concept before uploading final files\./);
    });
});

test.describe('Concept viewer @visual', () => {
    test('arrow keys switch version; the image is named "Concept n, version v" @visual', async ({ page }) => {
        await openCatalogue(page);
        const viewer = page.getByRole('region', { name: 'Concept 1', exact: true });
        await expect(viewer.getByRole('img', { name: 'Concept 1, version 2' })).toBeVisible();
        await viewer.getByRole('radio', { name: /^Version 2/ }).focus();
        await page.keyboard.press('ArrowRight');
        await expect(viewer.getByRole('radio', { name: 'Version 1 · 12 Nov 2026' })).toBeChecked();
        await expect(viewer.getByRole('img', { name: 'Concept 1, version 1' })).toBeVisible();
    });

    test('zoom: opens from the keyboard, traps focus, toggles actual size, Esc closes and focus returns to Zoom @visual', async ({ page }) => {
        await openCatalogue(page);
        const viewer = page.getByRole('region', { name: 'Concept 1', exact: true });
        const zoom = viewer.getByRole('button', { name: 'Zoom' });
        await zoom.focus();
        await page.keyboard.press('Enter');
        const dialog = page.getByRole('dialog', { name: 'Concept 1, version 2' });
        await expect(dialog).toBeVisible();
        for (let i = 0; i < 5; i++) {
            await page.keyboard.press('Tab');
            expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
        }
        const actual = dialog.getByRole('button', { name: 'Actual size' });
        await expect(actual).toHaveAttribute('aria-pressed', 'false');
        await actual.click();
        await expect(actual).toHaveAttribute('aria-pressed', 'true');
        await expect(dialog.getByRole('region', { name: 'Concept 1, version 2, actual size' })).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
        await expect(zoom).toBeFocused();
    });

    test('stable image (ADR-021): a poll that re-signs the URL keeps the rendered src @visual', async ({ page }) => {
        await openCatalogue(page);
        const image = page.getByRole('region', { name: 'Concept 1', exact: true }).getByRole('img', { name: 'Concept 1, version 2' });
        const before = await image.getAttribute('src');
        await page.getByRole('button', { name: 'Simulate a poll (re-signed URLs)' }).click();
        await page.getByRole('button', { name: 'Simulate a poll (re-signed URLs)' }).click();
        await expect(image).toHaveAttribute('src', before ?? '');
    });

    test('no image: "preview unavailable" is named, and there is nothing to zoom @visual', async ({ page }) => {
        await openCatalogue(page);
        const viewer = page.getByRole('region', { name: 'Concept 4', exact: true });
        await expect(viewer.getByRole('img', { name: 'Concept 4, version 1: preview unavailable' })).toBeVisible();
        await expect(viewer.getByRole('button', { name: 'Zoom' })).toHaveCount(0);
    });
});

test.describe('Tabs @visual', () => {
    test('arrow keys move and select (roving focus, disabled skipped); Tab goes to the panel @visual', async ({ page }) => {
        await openCatalogue(page);
        const list = page.getByRole('tablist', { name: 'Project sections', exact: true });
        await list.getByRole('tab', { name: 'Overview' }).focus();
        await page.keyboard.press('ArrowRight');
        const concepts = list.getByRole('tab', { name: 'Concepts, new' });
        await expect(concepts).toBeFocused();
        await expect(concepts).toHaveAttribute('aria-selected', 'true');
        const panelOf = async (tab: Locator) => page.locator(`[id="${await tab.getAttribute('aria-controls')}"]`);
        await expect(await panelOf(concepts)).toContainText('Three concepts are ready.');
        await expect(await panelOf(concepts)).toHaveAccessibleName('Concepts, new');
        await page.keyboard.press('ArrowRight');
        await expect(list.getByRole('tab', { name: 'Messages, new' })).toBeFocused();
        await page.keyboard.press('ArrowRight');
        await expect(list.getByRole('tab', { name: 'Brief' })).toHaveAttribute('aria-selected', 'true');
        await page.keyboard.press('ArrowRight'); // Files is disabled: wraps to Overview
        await expect(list.getByRole('tab', { name: 'Overview' })).toBeFocused();
        await page.keyboard.press('End');
        await expect(list.getByRole('tab', { name: 'Brief' })).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(await panelOf(list.getByRole('tab', { name: 'Brief' }))).toBeFocused();
        await expect(list.getByRole('tab', { name: 'Files' })).toBeDisabled();
    });

    test('the "new" dot is decorative; the tab name says "new" (top and bottom bar) @visual', async ({ page }) => {
        await openCatalogue(page);
        for (const name of ['Project sections', 'Project sections (bottom bar)']) {
            const list = page.getByRole('tablist', { name, exact: true });
            await expect(list.getByRole('tab', { name: 'Concepts, new' })).toBeVisible();
            await expect(list.getByRole('tab', { name: 'Messages, new' })).toBeVisible();
            await expect(list.getByRole('tab', { name: 'Overview', exact: true })).toBeVisible();
            for (const dot of await list.locator('[data-badge="new"]').all()) await expect(dot).toHaveAttribute('aria-hidden', 'true');
        }
    });
});

test.describe('Data table @visual', () => {
    test('sorting: header buttons set aria-sort and reorder the rows @visual', async ({ page }) => {
        await openCatalogue(page);
        const table = page.getByRole('table', { name: 'Needs action' });
        const firstCells = () => table.locator('tbody tr td:first-child a').allTextContents();
        await expect(table.getByRole('columnheader', { name: /Updated/ })).toHaveAttribute('aria-sort', 'descending');
        expect(await firstCells()).toEqual(['Northvale Coffee', 'Atlas Joinery', 'Brightside Dental']);
        await table.getByRole('button', { name: /^Project/ }).click();
        await expect(table.getByRole('columnheader', { name: /Project/ })).toHaveAttribute('aria-sort', 'ascending');
        expect(await firstCells()).toEqual(['Atlas Joinery', 'Brightside Dental', 'Northvale Coffee']);
        await table.getByRole('button', { name: /^Project/ }).click();
        await expect(table.getByRole('columnheader', { name: /Project/ })).toHaveAttribute('aria-sort', 'descending');
    });

    test('rows are one tab stop; arrows, Home and End move; Enter opens; reason chips are text @visual', async ({ page }) => {
        await openCatalogue(page);
        const table = page.getByRole('table', { name: 'Needs action' });
        const rows = table.locator('tbody tr');
        await expect(rows.nth(0).getByRole('list', { name: 'Why it needs action' })).toContainText('2 revision requests');
        await expect(rows.nth(0)).toHaveAttribute('tabindex', '0');
        await expect(rows.nth(1)).toHaveAttribute('tabindex', '-1');
        await rows.nth(0).focus();
        await page.keyboard.press('ArrowDown');
        await expect(rows.nth(1)).toBeFocused();
        await page.keyboard.press('End');
        await expect(rows.nth(2)).toBeFocused();
        await page.keyboard.press('Home');
        await expect(rows.nth(0)).toBeFocused();
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await expect(page.getByText('Opened Atlas Joinery')).toBeVisible();
        await expect(rows.nth(1)).toHaveAttribute('tabindex', '0'); // the row tab stop follows focus
    });
});

test.describe('Thread @visual', () => {
    test('days, senders and system lines; Enter sends, Shift+Enter adds a line, an empty message says why @visual', async ({ page }) => {
        await openCatalogue(page);
        const thread = page.getByRole('list', { name: 'Messages with your designer' });
        await expect(thread.getByRole('heading', { name: 'Today' })).toBeVisible();
        await expect(thread.getByRole('heading', { name: 'Yesterday' })).toBeVisible();
        await expect(thread.getByRole('heading', { name: 'Tuesday 17 November' })).toBeVisible();
        await expect(thread.locator('[data-kind="system"]')).toHaveText(/Concept 1 is ready for review\./);

        const send = page.getByRole('button', { name: 'Send', exact: true });
        await expect(send).toHaveAccessibleDescription('Write a message first.');
        const box = page.getByRole('textbox', { name: 'Message' });
        await box.fill('First line');
        await box.press('Shift+Enter');
        await box.pressSequentially('second line');
        await expect(box).toHaveValue('First line\nsecond line');
        await box.press('Enter');
        await expect(box).toHaveValue('');
        await expect(thread.locator('[data-kind="mine"]').last()).toContainText('First line\nsecond line');
    });
});

test.describe('Properties panel @visual', () => {
    test('inline edit: focus moves in and back; a bad value keeps the input and says why; Esc cancels; a good one saves @visual', async ({ page }) => {
        await openCatalogue(page);
        const edit = page.getByRole('button', { name: 'Edit revisions allowed' });
        await edit.click();
        const input = page.getByRole('spinbutton', { name: 'Revisions allowed' });
        await expect(input).toBeFocused();
        await expect(input).toHaveValue('3');
        await expect(input).toHaveAccessibleDescription('Whole numbers only. Changes are logged.');

        await page.keyboard.press('Escape');
        await expect(input).toBeHidden();
        await expect(edit).toBeFocused();

        await edit.click();
        await input.fill('5');
        await input.press('Enter');
        await expect(page.getByRole('button', { name: 'Saving…' })).toHaveAttribute('aria-busy', 'true');
        await page.clock.runFor(800);
        await expect(input).toBeHidden();
        await expect(edit).toBeFocused();
        await expect(page.getByRole('region', { name: 'Properties', exact: true })).toContainText('5');
        await expect(page.getByRole('region', { name: 'Properties', exact: true }).getByText('Not set')).toBeVisible();
    });
});

test.describe('usePolling @visual', () => {
    const activity = (page: Page) => page.getByRole('list', { name: 'Activity' });
    const announcer = (page: Page) => page.locator('[data-polling="announcer"]');

    test('new items are appended and announced politely, without moving focus or the focused item @visual', async ({ page }) => {
        await openCatalogue(page, 'light', { paused: true });
        await page.getByRole('button', { name: 'Add an event on the server' }).click();
        const first = activity(page).getByRole('listitem').first();
        await first.focus();
        const before = (await first.boundingBox())?.y;

        await page.clock.runFor(2000); // one poll
        await expect(activity(page).getByRole('listitem')).toHaveCount(2);
        await expect(activity(page).getByRole('listitem').last()).toHaveText('Event 2');
        await expect(announcer(page)).toHaveAttribute('aria-live', 'polite');
        await page.clock.runFor(100);
        await expect(announcer(page)).toHaveText('1 new event');
        await expect(first).toBeFocused();
        expect((await first.boundingBox())?.y).toBe(before); // nothing was inserted above it

        await page.clock.runFor(5100); // the announcement is cleared for the next one
        await expect(announcer(page)).toHaveText('');
    });

    test('3 failures in a row show a quiet "Reconnecting…" (not before); it backs off, then clears on success @visual', async ({ page }) => {
        await openCatalogue(page, 'light', { paused: true });
        const notice = page.locator('[data-polling="reconnecting"]');
        await page.getByRole('checkbox', { name: 'Make requests fail' }).check();
        await page.clock.runFor(2000);
        await page.clock.runFor(2000);
        await expect(notice).toHaveCount(0);
        await page.clock.runFor(2000);
        await expect(notice).toBeVisible();
        await expect(page.getByRole('status').filter({ hasText: 'Reconnecting…' })).toBeVisible(); // polite, not an alert
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(page.getByRole('alert').filter({ hasText: 'Reconnecting' })).toHaveCount(0);

        await page.getByRole('checkbox', { name: 'Make requests fail' }).uncheck();
        await page.getByRole('button', { name: 'Add an event on the server' }).click();
        await page.clock.runFor(2000); // backing off: the next try is 4 s after the third failure
        await expect(notice).toBeVisible();
        await page.clock.runFor(2000);
        await expect(notice).toHaveCount(0);
        await expect(activity(page).getByRole('listitem')).toHaveCount(2);
    });

    test('a hidden tab pauses polling; showing it polls at once @visual', async ({ page }) => {
        await openCatalogue(page, 'light', { paused: true });
        const setHidden = (hidden: boolean) =>
            page.evaluate((h) => {
                Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
                document.dispatchEvent(new Event('visibilitychange'));
            }, hidden);
        await setHidden(true);
        await page.getByRole('button', { name: 'Add an event on the server' }).click();
        await page.clock.runFor(30_000);
        await expect(activity(page).getByRole('listitem')).toHaveCount(1);
        await setHidden(false);
        await expect(activity(page).getByRole('listitem')).toHaveCount(2);
    });
});

test('the page has one h1 and no display title (UX §8.2, §13) @visual', async ({ page }) => {
    await openCatalogue(page);
    await expect(page.locator('[data-display-title]')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
});

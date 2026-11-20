// Story 1.8a: form and action primitives in the /dev/ui catalogue (UX §11–§13, ADR-022).
// Gate: @visual. L7 baselines in both themes at 1280 and 390 px, L7a axe (no serious or critical
// issues) for the page and every overlay, and the keyboard/focus/target behaviour the spec asks for.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const THEMES = ['light', 'dark'] as const;
type Theme = (typeof THEMES)[number];

async function openCatalogue(page: Page, theme: Theme = 'light') {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/dev/ui');
    await expect(page.getByRole('heading', { level: 1, name: 'UI catalogue' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
}

/** Waits for every finite CSS animation (e.g. a dialog's fade-in) to end: axe measures colour contrast
 *  on what is painted, and a half-faded overlay reads as low contrast on slow CI machines (story 1.9 CI). */
async function settleAnimations(page: Page) {
    await page.waitForFunction(() =>
        document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity),
    );
}

async function seriousViolations(page: Page, disableRules: string[] = []) {
    await settleAnimations(page);
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).disableRules(disableRules).analyze();
    return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`);
}

/** The overlays, each opened from its trigger, with the element to wait for. */
const OVERLAYS: Record<string, (page: Page) => Promise<void>> = {
    dialog: async (page) => {
        await page.getByRole('button', { name: 'Open dialog' }).click();
        await expect(page.getByRole('dialog', { name: 'Download your files' })).toBeVisible();
    },
    'confirm-acknowledgement': async (page) => {
        await page.getByRole('button', { name: 'Approve this concept' }).click();
        await expect(page.getByRole('dialog', { name: 'Approve concept 2?' })).toBeVisible();
    },
    'confirm-type-to-confirm': async (page) => {
        await page.getByRole('button', { name: 'Reset project' }).click();
        await expect(page.getByRole('dialog', { name: 'Reset Northvale Coffee?' })).toBeVisible();
    },
    menu: async (page) => {
        await page.getByRole('button', { name: 'Project actions' }).click();
        await expect(page.getByRole('menu')).toBeVisible();
    },
    select: async (page) => {
        await page.getByRole('combobox', { name: 'Industry', exact: true }).click();
        await expect(page.getByRole('listbox')).toBeVisible();
    },
    sheet: async (page) => {
        await page.getByRole('button', { name: 'Open sheet' }).click();
        await expect(page.getByRole('dialog', { name: 'Account' })).toBeVisible();
    },
    toasts: async (page) => {
        await page.getByRole('button', { name: 'Show success toast' }).click();
        await page.getByRole('button', { name: 'Show error toast' }).click();
        await expect(page.getByRole('alert').filter({ hasText: 'couldn’t send' })).toBeVisible();
    },
};

test.describe('L7 visual baselines @visual', () => {
    for (const theme of THEMES) {
        test(`the catalogue, every variant and state (${theme}) @visual`, async ({ page }) => {
            await openCatalogue(page, theme);
            await expect(page).toHaveScreenshot(`catalogue-${theme}.png`, { fullPage: true });
        });

        for (const [name, open] of Object.entries(OVERLAYS)) {
            test(`${name} open (${theme}) @visual`, async ({ page }) => {
                await page.clock.install(); // freezes the success toast's 5 s timer
                await openCatalogue(page, theme);
                await open(page);
                await page.mouse.move(0, 0); // no stray hover state under the pointer
                await expect(page).toHaveScreenshot(`${name}-${theme}.png`);
            });
        }
    }
});

test.describe('L7a accessibility @visual', () => {
    for (const theme of THEMES) {
        test(`the catalogue has no serious axe violations (${theme}) @visual`, async ({ page }) => {
            await openCatalogue(page, theme);
            expect(await seriousViolations(page)).toEqual([]);
        });

        test(`every overlay has no serious axe violations (${theme}) @visual`, async ({ page }) => {
            await page.clock.install();
            await openCatalogue(page, theme);
            for (const [name, open] of Object.entries(OVERLAYS)) {
                await open(page);
                // Radix Select is always modal: it aria-hides the page while it's open, and those
                // elements stay focusable in the DOM. Focus can't reach them (the listbox traps it,
                // asserted in 'the select is labelled…'), so only that rule is skipped, only here.
                expect(await seriousViolations(page, name === 'select' ? ['aria-hidden-focus'] : []), name).toEqual([]);
                await page.keyboard.press('Escape');
            }
        });
    }
});

test.describe('Dialog and Confirm @visual', () => {
    test('a dialog traps focus, Esc closes it, and focus returns to the trigger @visual', async ({ page }) => {
        await openCatalogue(page);
        const trigger = page.getByRole('button', { name: 'Open dialog' });
        await trigger.focus();
        await page.keyboard.press('Enter');
        const dialog = page.getByRole('dialog', { name: 'Download your files' });
        await expect(dialog).toBeVisible();
        await expect(dialog).toHaveAccessibleDescription('Your final files are ready.');

        for (let i = 0; i < 6; i++) {
            await page.keyboard.press(i % 2 ? 'Shift+Tab' : 'Tab');
            expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
        }
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
        await expect(trigger).toBeFocused();
    });

    test('while submitting, Esc, outside clicks and Close do not close it; then it closes and restores focus @visual', async ({ page }) => {
        await page.clock.install();
        await openCatalogue(page);
        const trigger = page.getByRole('button', { name: 'Open submitting dialog' });
        await trigger.click();
        const dialog = page.getByRole('dialog', { name: 'Send your brief?' });
        await dialog.getByRole('button', { name: 'Send brief' }).click();

        const sending = dialog.getByRole('button', { name: 'Sending…' });
        await expect(sending).toHaveAttribute('aria-busy', 'true');
        await expect(sending).toBeFocused(); // loading keeps focus (aria-disabled, not disabled)
        await page.keyboard.press('Escape');
        await page.mouse.click(5, 5);
        await dialog.getByRole('button', { name: 'Close' }).click({ force: true }); // aria-disabled
        await expect(dialog).toBeVisible();

        await page.clock.runFor(3000);
        await expect(dialog).toBeHidden();
        await expect(trigger).toBeFocused();
    });

    test('level 3: confirm stays blocked, saying why, until the acknowledgement is ticked; errors keep the dialog open @visual', async ({ page }) => {
        await page.clock.install();
        await openCatalogue(page);
        await page.getByRole('button', { name: 'Approve this concept' }).click();
        const dialog = page.getByRole('dialog', { name: 'Approve concept 2?' });
        const confirm = dialog.getByRole('button', { name: 'Approve this concept' });

        await expect(confirm).toHaveAttribute('aria-disabled', 'true');
        await expect(confirm).toHaveAccessibleDescription('Tick the box above to continue.');
        await confirm.click({ force: true }); // aria-disabled: Playwright would otherwise wait
        await expect(dialog.getByRole('button', { name: 'Approving…' })).toHaveCount(0);

        const ack = dialog.getByRole('checkbox', { name: 'I understand the other concepts will be archived' });
        await ack.check();
        await expect(confirm).not.toHaveAttribute('aria-disabled');
        await confirm.click();
        await expect(dialog.getByRole('button', { name: 'Approving…' })).toHaveAttribute('aria-busy', 'true');
        await page.keyboard.press('Escape');
        await expect(dialog).toBeVisible();

        await page.clock.runFor(1200);
        await expect(dialog.getByRole('alert')).toContainText('We couldn’t approve the concept');
        await expect(ack).toBeChecked(); // input is kept on error (§12)
        await expect(confirm).toBeVisible();
    });

    test('level 4: type-to-confirm needs the exact phrase, then focus returns to the trigger @visual', async ({ page }) => {
        await openCatalogue(page);
        const trigger = page.getByRole('button', { name: 'Reset project' });
        await trigger.click();
        const dialog = page.getByRole('dialog', { name: 'Reset Northvale Coffee?' });
        await expect(dialog).toHaveAttribute('data-tone', 'danger');
        const confirm = dialog.getByRole('button', { name: 'Reset project' });
        const phrase = dialog.getByRole('textbox', { name: 'Type RESET to confirm' });

        await phrase.fill('reset');
        await expect(confirm).toHaveAccessibleDescription('Type RESET to continue.');
        await phrase.fill('RESET');
        await expect(confirm).not.toHaveAttribute('aria-disabled');
        await confirm.click();
        await expect(dialog).toBeHidden();
        await expect(trigger).toBeFocused();

        await trigger.click(); // a fresh start every time
        await expect(page.getByRole('textbox', { name: 'Type RESET to confirm' })).toHaveValue('');
    });

    test('the sheet is a modal dialog that restores focus @visual', async ({ page }) => {
        await openCatalogue(page);
        const trigger = page.getByRole('button', { name: 'Open sheet' });
        await trigger.click();
        const sheet = page.getByRole('dialog', { name: 'Account' });
        await expect(sheet.getByRole('button', { name: 'Sign out' })).toBeVisible();
        expect(await sheet.evaluate((el) => el.contains(document.activeElement))).toBe(true);
        await page.keyboard.press('Escape');
        await expect(trigger).toBeFocused();
    });
});

test.describe('Menu and Select @visual', () => {
    test('the menu opens from the keyboard, arrows move, Esc returns focus @visual', async ({ page }) => {
        await openCatalogue(page);
        const trigger = page.getByRole('button', { name: 'Project actions' });
        await trigger.focus();
        await page.keyboard.press('Enter');
        const menu = page.getByRole('menu');
        await expect(menu).toBeVisible();
        await page.keyboard.press('ArrowDown');
        await expect(menu.getByRole('menuitem', { name: 'Settings' })).toBeFocused();
        await page.keyboard.press('ArrowDown'); // skips the disabled item
        await expect(menu.getByRole('menuitem', { name: 'Cancel project' })).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(menu).toBeHidden();
        await expect(trigger).toBeFocused();
    });

    test('the select is labelled, keyboard operable, and read-only never opens @visual', async ({ page }) => {
        await openCatalogue(page);
        const select = page.getByRole('combobox', { name: 'Industry', exact: true });
        await expect(select).toHaveAccessibleDescription('Helps us pick reference work.');
        await select.focus();
        await page.keyboard.press('Enter');
        await expect(page.getByRole('listbox')).toBeVisible();
        for (const key of ['Tab', 'Shift+Tab']) {
            await page.keyboard.press(key);
            expect(await page.getByRole('listbox').evaluate((el) => el.contains(document.activeElement)), key).toBe(true);
        }
        await page.getByRole('option', { name: 'Technology' }).click();
        await expect(select).toHaveText(/Technology/);
        await expect(select).toBeFocused();

        const error = page.getByRole('combobox', { name: 'Industry (error)' });
        await expect(error).toHaveAttribute('aria-invalid', 'true');
        await expect(error).toHaveAccessibleDescription('Error: Choose an industry');

        const readOnly = page.getByRole('combobox', { name: 'Industry (read-only)' });
        await readOnly.click();
        await readOnly.press('ArrowDown');
        await expect(page.getByRole('listbox')).toHaveCount(0);
        await expect(readOnly).toHaveText(/Technology/);
        await expect(page.getByRole('combobox', { name: 'Industry (disabled)' })).toBeDisabled();
    });
});

test.describe('Fields @visual', () => {
    test('hints, errors and counters are linked with aria-describedby @visual', async ({ page }) => {
        await openCatalogue(page);
        await expect(page.getByRole('textbox', { name: 'Brand name' })).toHaveAccessibleDescription('As it should appear in the logo.');
        const website = page.getByRole('textbox', { name: 'Website' });
        await expect(website).toHaveAttribute('aria-invalid', 'true');
        await expect(website).toHaveAccessibleDescription('Error: Enter a web address, like https://example.com');

        const over = page.getByRole('textbox', { name: 'Anything else' });
        await expect(over).toHaveAttribute('aria-invalid', 'true');
        await expect(over).toHaveAccessibleDescription(/characters too many$/);
        const counted = page.getByRole('textbox', { name: 'Describe your brand' });
        await expect(counted).toHaveAccessibleDescription(/^\d+ characters left$/);
        await expect(counted).not.toHaveAttribute('aria-invalid');

        await expect(page.getByRole('textbox', { name: 'Order reference' })).toHaveAttribute('readonly', '');
        await expect(page.getByRole('textbox', { name: 'Coupon code' })).toBeDisabled();
    });

    test('a failed submit shows the error summary first; its link focuses the field; typed input is kept @visual', async ({ page }) => {
        await openCatalogue(page);
        await page.getByRole('textbox', { name: 'Email' }).fill('kept@example.com');
        await page.getByRole('button', { name: 'Check the form' }).click();
        const summary = page.getByRole('region', { name: 'There is a problem' });
        await expect(summary).toBeFocused();
        await summary.getByRole('link', { name: 'Enter your brand name' }).click();
        const brand = page.getByRole('textbox', { name: 'Brand name' });
        await expect(brand).toBeFocused();
        await expect(brand).toHaveAccessibleDescription('As it should appear in the logo. Error: Enter your brand name');
        await expect(page.getByRole('textbox', { name: 'Email' })).toHaveValue('kept@example.com');
    });
});

test.describe('Checkbox, radio and choice chips @visual', () => {
    test('radios: arrow keys move the choice and skip disabled options; read-only ignores clicks @visual', async ({ page }) => {
        await openCatalogue(page);
        const pkg = page.getByRole('group', { name: 'Package', exact: true });
        await expect(pkg).toHaveAccessibleDescription('You can upgrade later.');
        await pkg.getByRole('radio', { name: /Starter/ }).focus();
        await page.keyboard.press('ArrowDown');
        await expect(pkg.getByRole('radio', { name: /Professional/ })).toBeChecked();
        await expect(pkg.getByRole('radio', { name: /Professional/ })).toHaveAccessibleDescription('6 concepts, unlimited revisions');
        await page.keyboard.press('ArrowDown'); // Agency is disabled: wraps to Starter
        await expect(pkg.getByRole('radio', { name: /Starter/ })).toBeChecked();

        const readOnly = page.getByRole('group', { name: 'Package (read-only)' });
        await readOnly.getByText('Starter').click();
        await expect(readOnly.getByRole('radio', { name: /Professional/ })).toBeChecked();
        await expect(page.getByRole('group', { name: 'Package (error)' })).toHaveAccessibleDescription('Error: Choose a package');
    });

    test('checkboxes: the label row toggles; read-only and disabled do not @visual', async ({ page }) => {
        await openCatalogue(page);
        const tips = page.getByRole('checkbox', { name: 'Email me design tips' });
        await page.getByText('Email me design tips').click();
        await expect(tips).toBeChecked();
        await expect(tips).toHaveAccessibleDescription('About once a month.');

        const readOnly = page.getByRole('checkbox', { name: 'Invoice sent (read-only)' });
        await readOnly.click();
        await readOnly.press('Space');
        await expect(readOnly).toBeChecked();
        await expect(page.getByRole('checkbox', { name: 'Archived (disabled)' })).toBeDisabled();
        await expect(page.getByRole('checkbox', { name: 'I understand approval is final' })).toHaveAccessibleDescription(
            'Error: Tick this box to approve the concept',
        );
    });

    test('choice chips: several (checkboxes) or one (radios with arrow keys), ticked as well as coloured @visual', async ({ page }) => {
        await openCatalogue(page);
        const styles = page.getByRole('group', { name: 'Styles you like' });
        await styles.getByRole('checkbox', { name: 'Playful' }).click();
        await expect(styles.getByRole('checkbox', { name: 'Playful' })).toBeChecked();
        await expect(styles.getByRole('checkbox', { name: 'Minimal' })).toBeChecked();
        await expect(styles.locator('label', { hasText: 'Playful' }).locator('svg')).toHaveCount(1);

        const tone = page.getByRole('group', { name: 'Tone' });
        await tone.getByRole('radio', { name: 'Warm' }).focus();
        await page.keyboard.press('ArrowRight');
        await expect(tone.getByRole('radio', { name: 'Cool' })).toBeChecked();
    });

    test('the theme switcher is a radio group: arrow keys change the theme (1.7 open item) @visual', async ({ page }) => {
        await openCatalogue(page, 'light');
        const group = page.getByRole('group', { name: 'Theme' });
        await group.getByRole('radio', { name: 'System' }).focus();
        await page.keyboard.press('ArrowRight');
        await expect(group.getByRole('radio', { name: 'Light' })).toBeChecked();
        await page.keyboard.press('ArrowRight');
        await expect(group.getByRole('radio', { name: 'Dark' })).toBeChecked();
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    });
});

test.describe('Buttons, links and targets @visual', () => {
    test('loading keeps a label and stays focusable; disabled says why and stays reachable @visual', async ({ page }) => {
        await openCatalogue(page);
        const loading = page.getByRole('button', { name: 'Sending…' });
        await expect(loading).toHaveAttribute('aria-busy', 'true');
        await expect(loading).toHaveAttribute('aria-disabled', 'true');
        await expect(loading).not.toHaveAttribute('disabled');

        const disabled = page.locator('button[aria-disabled="true"]', { hasText: 'Request revision' });
        await expect(disabled).toHaveAccessibleDescription('You have no revisions left.');
        await disabled.focus();
        await expect(disabled).toBeFocused();

        const tryIt = page.getByRole('button', { name: 'Try loading' });
        await tryIt.click();
        await expect(page.getByRole('button', { name: 'Requesting…' })).toBeFocused();
    });

    test('inline links are always underlined; standalone links on hover and focus @visual', async ({ page }, info) => {
        await openCatalogue(page);
        const decoration = (name: string) => page.getByRole('link', { name }).evaluate((el) => getComputedStyle(el).textDecorationLine);
        expect(await decoration('always underlined')).toBe('underline');
        expect(await decoration('hello@example.com')).toBe('underline');
        expect(await decoration('View all concepts')).toBe('none');
        // Keyboard focus underlines it (touch has no hover: Tailwind's hover is @media (hover: hover)).
        await page.getByRole('link', { name: 'hello@example.com' }).focus();
        await page.keyboard.press('Tab');
        await expect(page.getByRole('link', { name: 'View all concepts' })).toBeFocused();
        expect(await decoration('View all concepts')).toBe('underline');
        if (!info.project.use.hasTouch) {
            await page.mouse.move(0, 0);
            await page.getByRole('link', { name: 'Download invoice' }).hover();
            expect(await decoration('Download invoice')).toBe('underline');
        }
    });

    test('focus is always visible: a 2 px accent outline @visual', async ({ page }) => {
        await openCatalogue(page);
        await page.getByRole('button', { name: 'Request revision' }).first().focus();
        await page.keyboard.press('Tab');
        const outline = await page.evaluate(() => {
            const s = getComputedStyle(document.activeElement as Element);
            return { style: s.outlineStyle, width: s.outlineWidth };
        });
        expect(outline).toEqual({ style: 'solid', width: '2px' });
    });

    test('targets: at least 24 px everywhere, 44 px for buttons and controls on touch (UX §13) @visual', async ({ page }, info) => {
        await openCatalogue(page);
        const touch = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
        expect(touch).toBe(info.project.name === 'phone');

        const sizes = await page.locator('main').evaluate((main) =>
            [...main.querySelectorAll<HTMLElement>('button, a, input, textarea, [role=combobox], label:has(input)')]
                .filter((el) => !(el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio'))) // their label row is the target
                .filter((el) => !(el.tagName === 'A' && el.closest('p'))) // inline links in text are exempt (WCAG 2.5.8)
                .map((el) => ({ what: `${el.tagName} ${el.textContent?.trim().slice(0, 30)}`, h: el.getBoundingClientRect().height, button: el.tagName === 'BUTTON' })),
        );
        for (const s of sizes) expect(s.h, s.what).toBeGreaterThanOrEqual(24);
        if (touch) for (const s of sizes.filter((x) => x.button)) expect(s.h, s.what).toBeGreaterThanOrEqual(44);
    });
});

test.describe('Toast @visual', () => {
    test('success is polite and leaves after 5 s; an error is an alert that stays until dismissed @visual', async ({ page }) => {
        await page.clock.install();
        await openCatalogue(page);
        await page.getByRole('button', { name: 'Show success toast' }).click();
        const success = page.getByRole('status').filter({ hasText: 'Message sent' });
        await expect(success).toBeVisible();
        await page.clock.runFor(5100);
        await expect(success).toBeHidden();

        await page.getByRole('button', { name: 'Show error toast' }).click();
        const error = page.getByRole('alert').filter({ hasText: 'couldn’t send' });
        await expect(error).toBeVisible();
        await page.clock.runFor(30_000);
        await expect(error).toBeVisible();
        await error.getByRole('button', { name: 'Dismiss' }).click();
        await expect(error).toBeHidden();
    });
});

test('the catalogue has one h1 and no display title (UX §8.2, §13) @visual', async ({ page }) => {
    await openCatalogue(page);
    await expect(page.locator('[data-display-title]')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
});

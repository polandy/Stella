import { expect, test, type Locator, type Page } from '@playwright/test';
import { UNDO_WINDOW_MS } from '../src/lib/undo/pending-removals';
import { addPerson, addTag, appReady, profileRow, signIn } from './app';

/*
 * The keyboard and screen-reader promises of the accessibility audit (docs/05 §5.9, docs/02
 * §2.19). Written after the owner checked them in the running app (docs/08 §8.4.1).
 *
 * Everything this file writes lands on people it invents, so no other spec's counts move.
 * Searches read the demo household (Kurt and Heidi Lehmann are the two Lehmanns) without
 * changing it. The one case that switches the interface to German hands the account back in
 * English, since the language is stored in the profile and the rest of the suite reads English.
 */

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

/** What a field's `aria-activedescendant` points at, as a screen reader would read it. */
function pointedAt(field: Locator) {
	return field.evaluate((element) => {
		const id = element.getAttribute('aria-activedescendant');
		const target = id ? document.getElementById(id) : null;
		if (!target) return null;
		return {
			role: target.getAttribute('role'),
			selected: target.getAttribute('aria-selected'),
			text: (target.textContent ?? '').replace(/\s+/g, ' ').trim()
		};
	});
}

/**
 * Waits until the field announces `option` as the highlighted one, while keeping the cursor.
 * Both sides are read in the same poll: the list re-sorts as the query settles.
 */
async function expectPointingAt(field: Locator, option: Locator): Promise<void> {
	await expect
		.poll(async () => {
			const pointed = await pointedAt(field);
			if (!pointed) return 'nothing';
			const text = ((await option.textContent()) ?? '').replace(/\s+/g, ' ').trim();
			return `${pointed.role}/${pointed.selected}/${pointed.text === text ? 'that option' : `${pointed.text} instead of ${text}`}`;
		})
		.toBe('option/true/that option');
	await expect(field).toBeFocused();
}

/**
 * Puts keyboard focus on a control the way a keyboard does — by tabbing onto it — so the page
 * sees a keyboard user (`:focus-visible`) rather than a script.
 */
async function tabOnto(page: Page, control: Locator): Promise<void> {
	await control.focus();
	await page.keyboard.press('Shift+Tab');
	await page.keyboard.press('Tab');
	await expect(control).toBeFocused();
}

test.describe('the moment composer', () => {
	test('Tab reaches the Shared switch and the Photo button, and Space flips the switch by name', async ({
		page
	}) => {
		const composer = page.getByLabel('What happened?');
		const shared = page.getByRole('checkbox', { name: 'Share with household' });
		await composer.focus();

		// The name stays put; only the state changes, which is what a screen reader reads out.
		await page.keyboard.press('Tab');
		await expect(shared).toBeFocused();
		await expect(shared).toBeChecked();
		await page.keyboard.press('Space');
		await expect(shared).not.toBeChecked();
		await expect(page.getByRole('checkbox', { name: 'Share with household' })).toBeFocused();
		await page.keyboard.press('Space');
		await expect(shared).toBeChecked();

		// The photo button is a real stop in the tab order, not a hidden input behind a label.
		await page.keyboard.press('Tab');
		await expect(page.locator('input[type="file"]').first()).toBeFocused();
	});

	test('the @-list moves its highlight over real options while the cursor stays in the text', async ({
		page
	}) => {
		const field = page.getByLabel('What happened?');
		await field.pressSequentially('@Lehmann');
		const options = page.getByRole('listbox', { name: 'People' }).getByRole('option');
		await expect(options.nth(1)).toBeVisible();

		await expectPointingAt(field, options.nth(0));
		await page.keyboard.press('ArrowDown');
		await expectPointingAt(field, options.nth(1));
	});

	test('a note’s @-list moves its highlight the same way', async ({ page }) => {
		await addPerson(page, 'Ambrosius', 'Quellenhof');
		const notes = page.locator('#section-notes');
		await notes.getByRole('button', { name: 'Add note' }).click();
		const field = notes.getByRole('textbox', { name: 'Note' });
		await field.pressSequentially('@Lehmann');
		const options = page.getByTestId('mention-picker').getByRole('option');
		await expect(options.nth(1)).toBeVisible();

		await expectPointingAt(field, options.nth(0));
		await page.keyboard.press('ArrowDown');
		await expectPointingAt(field, options.nth(1));
	});
});

test('the person picker points at the highlighted person, and "No one found." is no option', async ({
	page
}) => {
	await addPerson(page, 'Ilvy', 'Quarella');
	const panel = page.locator('#section-relationships');
	await panel.getByRole('button', { name: 'Add relationship' }).click();
	const field = panel.locator('form[action="?/addRelationship"]').getByLabel('Person');
	await field.click();
	await field.fill('Lehmann');
	const listbox = page.getByTestId('person-search-listbox');
	const options = listbox.getByRole('option');
	await expect(options.nth(1)).toBeVisible();
	await expect(field).toHaveAttribute('aria-expanded', 'true');

	await expectPointingAt(field, options.nth(0));
	await page.keyboard.press('ArrowDown');
	await expectPointingAt(field, options.nth(1));

	// Nobody matches: the note says so on screen, and is not offered as something to pick.
	// The one option left is the offer to add them, and the field can point at it.
	await field.fill('Zyxwvutsrq');
	await expect(listbox.getByText('No one found.')).toBeVisible();
	const picker = page.locator(`[id="${await field.getAttribute('aria-controls')}"]`);
	await expect(picker).toHaveRole('listbox');
	await expect(picker.getByRole('option', { name: 'No one found.' })).toHaveCount(0);
	const create = picker.getByRole('option', { name: 'Add “Zyxwvutsrq” as a new person' });
	await expect(picker.getByRole('option')).toHaveCount(1);
	await expectPointingAt(field, create);
});

test('the ⌘K palette points at its rows as options, and Enter follows the highlighted one', async ({
	page
}) => {
	await page.keyboard.press('ControlOrMeta+k');
	const field = page.getByRole('combobox', { name: 'Jump to' });
	await expect(field).toBeFocused();
	await field.fill('Lehmann');
	const options = page.locator('#palette-rows').getByRole('option');
	await expect(options.nth(1)).toBeVisible();
	await expect(field).toHaveAttribute('aria-expanded', 'true');

	await expectPointingAt(field, options.nth(0));
	await page.keyboard.press('ArrowDown');
	await expectPointingAt(field, options.nth(1));

	const href = await options.nth(1).getAttribute('href');
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(new RegExp(`${href}$`));
});

test.describe('focus after a form closes', () => {
	test('saving a note or a logged contact hands focus back to the section button', async ({
		page
	}) => {
		await addPerson(page, 'Wendelin', 'Rapperswiler');

		const notes = page.locator('#section-notes');
		await notes.getByRole('button', { name: 'Add note' }).click();
		await notes.getByRole('textbox', { name: 'Note' }).fill('Brings quince jam every autumn.');
		await notes.getByRole('button', { name: 'Add note' }).last().click();
		await expect(notes).toContainText('Brings quince jam every autumn.');
		await expect(notes.locator('[data-section-toggle]')).toBeFocused();
		await expect(notes.locator('[data-section-toggle]')).toHaveText(/Add note/);

		const story = page.locator('#section-story');
		await story.getByRole('button', { name: 'Log contact' }).click();
		await story.getByLabel('Kind').selectOption('call');
		await story.getByPlaceholder('What happened? (optional)').fill('Quince harvest call');
		await story.getByRole('button', { name: 'Log interaction' }).click();
		await expect(page.getByTestId('story-timeline')).toContainText('Quince harvest call');
		await expect(story.locator('[data-section-toggle]')).toBeFocused();
	});

	test('an inline edit hands focus back to its value after Save, Cancel and Escape', async ({
		page
	}) => {
		await addPerson(page, 'Ottilie', 'Brandenberger');

		// Save: the heading's button now carries the new name, and holds the focus.
		await page.getByRole('button', { name: 'Ottilie Brandenberger', exact: true }).click();
		await page.getByRole('textbox', { name: 'Shown as' }).fill('Ottilie Brandenberger-Sutz');
		await page.getByRole('button', { name: 'Save' }).click();
		await expect(page.getByRole('heading', { name: 'Ottilie Brandenberger-Sutz' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Ottilie Brandenberger-Sutz', exact: true })).toBeFocused();

		// Cancel.
		await page.getByRole('button', { name: 'Add a description' }).click();
		await page.getByRole('textbox', { name: 'Edit description' }).fill('never kept');
		await page.getByRole('button', { name: 'Cancel', exact: true }).click();
		await expect(page.getByRole('textbox', { name: 'Edit description' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Add a description' })).toBeFocused();

		// Escape.
		await page.getByRole('button', { name: 'Add a description' }).click();
		await expect(page.getByRole('textbox', { name: 'Edit description' })).toBeFocused();
		await page.keyboard.press('Escape');
		await expect(page.getByRole('textbox', { name: 'Edit description' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Add a description' })).toBeFocused();
	});
});

test.describe('removing with the keyboard', () => {
	test('a removed phone number hands focus to the next one’s remove button', async ({ page }) => {
		await addPerson(page, 'Severin', 'Gmürhalden');
		const contact = await profileRow(page, 'Contact');
		for (const [label, value] of [
			['Cellar', '+41 79 555 41 01'],
			['Garden', '+41 79 555 41 02']
		]) {
			await contact.getByRole('button', { name: 'Add' }).click();
			await contact.getByLabel('Kind').selectOption({ label: 'Phone' });
			await contact.getByPlaceholder('Label (optional)').fill(label);
			await contact.getByPlaceholder('Value').fill(value);
			await contact.getByRole('button', { name: 'Add', exact: true }).last().click();
			await expect(contact).toContainText(value);
		}

		await tabOnto(page, contact.getByRole('button', { name: 'Remove Cellar' }));
		await page.keyboard.press('Enter');
		await expect(contact).not.toContainText('+41 79 555 41 01');
		await expect(contact.getByRole('button', { name: 'Remove Garden' })).toBeFocused();
	});

	test('removing tags hands focus to the next tag, and the last one to the row heading', async ({
		page
	}) => {
		await addPerson(page, 'Philippa', 'Ondrasekova');
		await addTag(page, 'Zzz-a11y-first');
		await addTag(page, 'Zzz-a11y-second');
		const tags = await profileRow(page, 'Tags');

		await tabOnto(page, tags.getByRole('button', { name: 'Remove tag Zzz-a11y-first' }));
		await page.keyboard.press('Enter');
		await expect(tags).not.toContainText('Zzz-a11y-first');
		const second = tags.getByRole('button', { name: 'Remove tag Zzz-a11y-second' });
		await expect(second).toBeFocused();

		await page.keyboard.press('Enter');
		await expect(tags).toContainText('No tags yet.');
		await expect(tags.getByRole('button', { name: /^Tags/ })).toBeFocused();
	});
});

test('the undo toast waits while hovered or focused, and commits a full window after', async ({
	page
}) => {
	// Re-open Home with the page's clock under the test's hand, then stop it: from here on
	// only `runFor` moves the undo window.
	await page.clock.install();
	await signIn(page);
	await addPerson(page, 'Leander', 'Wyrschenbach');
	await addTag(page, 'Zzz-a11y-hover');
	await addTag(page, 'Zzz-a11y-focus');
	await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);

	const sent: string[] = [];
	page.on('request', (request) => {
		if (request.method() === 'POST' && request.url().includes('removeTag')) sent.push(request.url());
	});
	const toast = page.getByTestId('toast-undo');

	// Hovered: many windows pass and nothing is sent.
	await page.getByRole('button', { name: 'Remove tag Zzz-a11y-hover' }).click();
	await expect(toast).toContainText('Tag removed');
	await toast.hover();
	await page.clock.runFor(UNDO_WINDOW_MS * 3);
	await expect(toast).toBeVisible();
	expect(sent).toEqual([]);

	// Let go: a full window later the removal is sent and the toast goes.
	let committed = page.waitForResponse(
		(response) => response.request().method() === 'POST' && response.url().includes('removeTag')
	);
	await page.mouse.move(1, 1);
	await page.clock.runFor(UNDO_WINDOW_MS + 1);
	await committed;
	await page.clock.runFor(1000);
	await expect(toast).toHaveCount(0);

	// Focused: the same, through the keyboard's way into the toast.
	await page.getByRole('button', { name: 'Remove tag Zzz-a11y-focus' }).click();
	await expect(toast).toContainText('Tag removed');
	await toast.getByRole('button', { name: 'Undo' }).focus();
	await page.clock.runFor(UNDO_WINDOW_MS * 3);
	await expect(toast).toBeVisible();
	expect(sent).toHaveLength(1);

	committed = page.waitForResponse(
		(response) => response.request().method() === 'POST' && response.url().includes('removeTag')
	);
	await page.getByRole('button', { name: 'Search' }).focus();
	await page.clock.runFor(UNDO_WINDOW_MS + 1);
	await committed;
	expect(sent).toHaveLength(2);
});

test.describe('form errors', () => {
	test('an empty new-person form says why in an alert and marks the name invalid', async ({
		page
	}) => {
		await page.goto('/contacts/new');
		await appReady(page);
		const firstName = page.getByLabel('First name');
		await expect(firstName).not.toHaveAttribute('aria-invalid', 'true');

		await page.getByRole('button', { name: 'Add person' }).click();

		await expect(page.getByRole('alert')).toHaveText('Please enter at least a name or nickname.');
		await expect(firstName).toHaveAttribute('aria-invalid', 'true');
		await expect(firstName).toHaveAccessibleDescription('Please enter at least a name or nickname.');
	});

	test.describe('signed out', () => {
		test.use({ storageState: { cookies: [], origins: [] } });
		// The signed-in `beforeEach` above would sign this visitor straight back in.
		test.beforeEach(async ({ context }) => {
			await context.clearCookies();
		});

		test('a wrong password says so in an alert and marks both fields invalid', async ({ page }) => {
			await page.goto('/login');
			const email = page.getByLabel('Email');
			const password = page.getByLabel('Password');
			await email.fill('demo@stella.local');
			await password.fill('not-the-password-at-all');
			await page.getByRole('button', { name: 'Sign in', exact: true }).click();

			await expect(page.getByRole('alert')).toHaveText('Invalid email or password.');
			for (const field of [email, password]) {
				await expect(field).toHaveAttribute('aria-invalid', 'true');
				await expect(field).toHaveAccessibleDescription('Invalid email or password.');
			}
		});
	});
});

test.describe('circle colours', () => {
	/** `search` is the shell's search button, which says the page is ready (`appReady`). */
	async function openNewCircle(page: Page, words: { search: string; newCircle: string }) {
		await page.goto('/circles');
		await expect(page.getByRole('button', { name: words.search })).toBeEnabled();
		await page.getByRole('button', { name: words.newCircle }).click();
	}

	test('every colour has a name a screen reader can read, in English', async ({ page }) => {
		await openNewCircle(page, { search: 'Search', newCircle: 'New circle' });
		const colours = page.getByRole('group', { name: 'Colour' }).getByRole('radio');
		await expect(colours.first()).toBeVisible();
		for (const radio of await colours.all()) await expect(radio).toHaveAccessibleName(/\S/);
		await expect(page.getByRole('radio', { name: 'Rosewater' })).toHaveCount(1);
		await expect(page.getByRole('radio', { name: 'Lavender' })).toHaveCount(1);
	});

	test.describe('in German', () => {
		test.afterEach(async ({ page }) => {
			await page.goto('/settings');
			await page.getByRole('button', { name: 'English' }).click();
			await expect(page.getByRole('heading', { name: /^Settings$/ })).toBeVisible();
		});

		test('every colour has a German name', async ({ page }) => {
			await page.goto('/settings');
			await page.getByRole('button', { name: 'Deutsch' }).click();
			await expect(page.getByRole('heading', { name: /^Einstellungen$/ })).toBeVisible();

			await openNewCircle(page, { search: 'Suche', newCircle: 'Neuer Kreis' });
			const colours = page.getByRole('group', { name: 'Farbe' }).getByRole('radio');
			await expect(colours.first()).toBeVisible();
			await expect(page.getByRole('radio', { name: 'Rosenholz' })).toHaveCount(1);
			await expect(page.getByRole('radio', { name: 'Lavendel' })).toHaveCount(1);
		});
	});
});

test.describe('live match counts', () => {
	test('People announces how many it found while typing', async ({ page }) => {
		await page.getByRole('link', { name: 'People' }).first().click();
		const count = page.getByTestId('people-match-count');
		await expect(count).toHaveAttribute('aria-live', 'polite');
		await expect(count).toHaveText('');

		await page.getByRole('searchbox', { name: 'Find someone' }).fill('Lehmann');
		// Kurt and Heidi at least; another spec may have added a Lehmann of its own.
		await expect(count).toHaveText(/^([2-9]|\d{2,}) people found$/);
	});

	test('Circles announces how many it found while typing', async ({ page }) => {
		await page.goto('/circles');
		await appReady(page);
		const count = page.getByTestId('circle-match-count');
		await expect(count).toHaveAttribute('aria-live', 'polite');
		await expect(count).toHaveText('');

		await page.getByRole('searchbox', { name: 'Find a circle' }).fill('Frauenchor');
		await expect(count).toHaveText('1 circle found');
		await page.getByRole('searchbox', { name: 'Find a circle' }).fill('zzzz-no-such-circle');
		await expect(count).toHaveText('No circles found');
	});
});

test('Escape closes the desktop account menu and hands focus back to it', async ({ page }) => {
	const menu = page.locator('details', { has: page.locator('summary', { hasText: 'Account menu' }) });
	const summary = menu.locator('summary');
	await summary.click();
	await expect(menu).toHaveAttribute('open', '');

	// From inside the menu, so the focus has somewhere to come back from.
	await page.keyboard.press('Tab');
	await expect(summary).not.toBeFocused();
	await expect(menu.locator(':focus')).toHaveCount(1);
	await page.keyboard.press('Escape');

	await expect(menu).not.toHaveAttribute('open');
	await expect(summary).toBeFocused();
});

import { expect, test, type Locator, type Page } from '@playwright/test';
import { appReady, fillDate, openPerson, profileRow, signIn } from './app';
import { seedHousehold } from './seed';

/*
 * The identity card's facts, each edited where it is read (docs/05 §5.5, docs/02 §2.2; UX
 * review C1, C5). Written after the owner tried it in the running app (docs/08 §8.4.1).
 *
 * The demo household is only read here — Markus Brunner's and Kurt Lehmann's pages are opened
 * by id, editors opened and the quiet button pressed, nothing saved. Every case that writes
 * brings its own person, whom no other spec names (the restore seed adds each name once).
 * Already covered elsewhere: the job slot (contact-job.spec.ts), gender in the name editor
 * (gender.spec.ts), adding a date to an empty record and its refusal (offline-additions.spec.ts).
 */

const MARKUS = 'demo-c-markus';
const KURT = 'demo-c-kurt';

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

const facts = (page: Page) => page.getByTestId('identity-facts');
const card = (page: Page) => page.getByTestId('identity-card');
const undoToast = (page: Page) => page.getByTestId('toast-undo');

/** Opens a demo person's page by id — a name another spec may have changed is not relied on. */
async function openDemoPerson(page: Page, id: string): Promise<void> {
	await page.goto(`/contacts/${id}`);
	await expect(page.locator('#section-relationships')).toBeVisible();
	await appReady(page);
}

/** What a case's own person starts with — the setting, not the step under test. */
interface SeedSetting {
	birth?: string;
	job?: string;
	circles?: Parameters<typeof seedHousehold>[4];
}

/** Seeds one person of a case's own and opens their page. */
async function openOwnPerson(page: Page, name: string, setting: SeedSetting = {}): Promise<void> {
	await seedHousehold(
		page,
		[name],
		[],
		{},
		setting.circles ?? [],
		[],
		[],
		setting.birth ? { [name]: setting.birth } : {},
		setting.job ? { [name]: { title: setting.job } } : {}
	);
	await openPerson(page, new RegExp(name));
}
/** The editor a fact opened in its place. */
const editorOf = (page: Page, fact: 'dates' | 'address' | 'circles'): Locator =>
	page.locator(`[data-fact-editor="${fact}"]`);

test('Markus’s card states each thing once: the facts above, only what has no fact below', async ({
	page
}) => {
	await openDemoPerson(page, MARKUS);

	// Every date its own fact, the address, the job, the last contact, the circles with their +.
	await expect(facts(page).locator('[data-fact="birthday"]')).toContainText('14 March 1983');
	await expect(facts(page)).toContainText('Hochzeitstag');
	await expect(facts(page)).toContainText('13 June 2009');
	await expect(facts(page).locator('[data-fact="address"]')).toContainText('Spitalackerstrasse');
	await expect(facts(page).locator('[data-fact="job"]')).toContainText('Bauingenieur');
	await expect(facts(page).locator('[data-fact="last-contact"]')).toBeVisible();
	await expect(facts(page).getByRole('button', { name: 'Join a circle' })).toBeVisible();

	// Below the facts only Contact — read once it is there — and without the address.
	const contact = card(page).locator('[data-identity-row="contact"]');
	await expect(contact).toContainText('markus.brunner@bluewin.ch');
	await expect(contact).not.toContainText('Spitalackerstrasse');
	const rows = await card(page)
		.locator('[data-identity-row]')
		.evaluateAll((all) => all.map((row) => row.getAttribute('data-identity-row')));
	expect(rows).toEqual(['contact']);
	for (const gone of ['Dates', 'Circles', 'Gender'])
		await expect(card(page).locator(`section[data-row="${gone}"]`)).toHaveCount(0);
	await expect(card(page).getByTestId('identity-add-more')).toHaveText('Add tags');
});

test('the dates editor opens from a date, adds and removes with undo, and Done hands the fact back the cursor', async ({
	page
}) => {
	await openOwnPerson(page, 'Datura Facettli', { birth: '1990-04-02' });
	const birthday = facts(page).locator('[data-fact="birthday"]').getByRole('button');
	await expect(birthday).toHaveAccessibleName(/^Edit dates/);

	await birthday.click();
	const editor = editorOf(page, 'dates');
	await expect(editor.getByRole('button', { name: 'Add a date' })).toBeFocused();
	await editor.getByRole('button', { name: 'Add a date' }).click();
	await editor.getByLabel('Kind').selectOption({ label: 'Anniversary' });
	await fillDate(editor, 'Day', '2015-06-13');
	await editor.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByTestId('toast-notice')).toContainText('Saved');
	const remove = editor.getByRole('button', { name: 'Remove Anniversary' });
	await expect(remove).toBeVisible();

	// Removed, it leaves the list at once; Undo brings it back.
	await remove.click();
	await expect(undoToast(page)).toContainText('Date removed');
	await expect(remove).toHaveCount(0);
	await undoToast(page).getByRole('button', { name: 'Undo' }).click();
	await expect(remove).toBeVisible();

	await editor.getByRole('button', { name: 'Done' }).click();
	await expect(editor).toHaveCount(0);
	await expect(birthday).toBeFocused();
	// The anniversary is a fact of its own now, beside the birthday.
	await expect(facts(page)).toContainText('Anniversary');
	await expect(facts(page)).toContainText('13 June 2015');
});

test('the address is added through its slot, edited and saved, joined by another, and removed with undo', async ({
	page
}) => {
	await openOwnPerson(page, 'Adalbert Facettli', { birth: '1971-02-03', job: 'Kartograf' });

	// Nothing logged: no last contact — read once the facts it has are up (C5).
	await expect(facts(page).locator('[data-fact="birthday"]')).toBeVisible();
	await expect(facts(page).locator('[data-fact="last-contact"]')).toHaveCount(0);

	const addMore = card(page).getByTestId('identity-add-more');
	await expect(addMore).toHaveText('Add address, phone, email …');
	await addMore.click();
	const slot = facts(page).locator('[data-fact="address"][data-slot]').getByRole('button');
	await expect(slot).toBeFocused();
	await expect(slot).toHaveAccessibleName('Add address');
	await expect(card(page).locator('[data-identity-row="contact"]')).toBeVisible();
	await expect(card(page).locator('[data-identity-row="tags"]')).toBeVisible();

	await slot.click();
	let editor = editorOf(page, 'address');
	await editor.getByLabel('Label (optional)').fill('Home');
	await editor.getByRole('textbox', { name: 'Address' }).fill('Seestrasse 1\n8000 Zürich');
	await editor.getByRole('button', { name: 'Add', exact: true }).click();
	const address = facts(page).locator('[data-fact="address"]');
	await expect(address).toContainText('Seestrasse 1, 8000 Zürich');
	await expect(editor).toHaveCount(0);

	// Edited in place.
	await address.getByRole('button', { name: /^Edit address/ }).click();
	editor = editorOf(page, 'address');
	await editor.getByRole('textbox', { name: 'Address' }).fill('Seestrasse 3\n8000 Zürich');
	await editor.getByRole('button', { name: 'Save' }).click();
	await expect(address).toContainText('Seestrasse 3, 8000 Zürich');
	await expect(address).not.toContainText('Seestrasse 1');

	// Another one joins it.
	await address.getByRole('button', { name: /^Edit address/ }).click();
	await editor.getByRole('button', { name: 'Add another address' }).click();
	await editor
		.getByTestId('add-address')
		.getByRole('textbox', { name: 'Address' })
		.fill('Bergweg 5');
	await editor.getByTestId('add-address').getByRole('button', { name: 'Add', exact: true }).click();
	await expect(address).toContainText('Bergweg 5');
	await expect(address).toContainText('Seestrasse 3, 8000 Zürich');

	// One removed leaves at once, and Undo brings it back.
	await address.getByRole('button', { name: /^Edit address/ }).click();
	const blocks = editor.locator('[data-address]');
	await expect(blocks).toHaveCount(2);
	await blocks.nth(1).getByRole('button', { name: 'Remove address' }).click();
	await expect(undoToast(page)).toContainText('Address removed');
	await expect(blocks).toHaveCount(1);
	await undoToast(page).getByRole('button', { name: 'Undo' }).click();
	await expect(blocks).toHaveCount(2);
});

test('a removed date and a removed phone number are gone once the page is left', async ({
	page
}) => {
	await openOwnPerson(page, 'Dorotea Facettli', { birth: '1991-05-03' });
	const personUrl = page.url();

	await facts(page).locator('[data-fact="birthday"]').getByRole('button').click();
	const editor = editorOf(page, 'dates');
	await editor.getByRole('button', { name: 'Add a date' }).click();
	await editor.getByLabel('Kind').selectOption({ label: 'Anniversary' });
	await fillDate(editor, 'Day', '2016-07-14');
	await editor.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByTestId('toast-notice')).toContainText('Saved');
	await editor.getByRole('button', { name: 'Remove Anniversary' }).click();
	await expect(undoToast(page)).toContainText('Date removed');
	await editor.getByRole('button', { name: 'Done' }).click();

	const contact = await profileRow(page, 'Contact');
	await contact.getByRole('button', { name: 'Add' }).click();
	await contact.getByLabel('Kind').selectOption({ label: 'Phone' });
	await contact.getByPlaceholder('Label (optional)').fill('Atelier');
	await contact.getByPlaceholder('Value').fill('+41 79 555 72 14');
	await contact.getByRole('button', { name: 'Add', exact: true }).last().click();
	await expect(contact).toContainText('+41 79 555 72 14');
	await contact.getByRole('button', { name: 'Remove Atelier' }).click();
	await expect(undoToast(page).filter({ hasText: 'Contact detail removed' })).toBeVisible();

	// Leaving through Home sends both held removals before Home loads (docs/02 §2.23).
	await page.getByRole('link', { name: 'Home', exact: true }).first().click();
	await expect(page.getByRole('heading', { name: 'What happened?' })).toBeVisible();
	await page.goto(personUrl);
	await appReady(page);
	await expect(facts(page)).not.toContainText('Anniversary');
	await expect(card(page)).not.toContainText('+41 79 555 72 14');
});

test('the circles editor changes a role, leaves with undo, and joins with a role', async ({
	page
}) => {
	const person = 'Zirkonia Facettli';
	const choir = 'Facettli Chor';
	await openOwnPerson(page, person, {
		circles: [{ name: choir, members: [{ person, role: 'Alt' }] }]
	});
	const chips = facts(page).locator('[data-fact="circles"]');
	await expect(chips).toContainText(`${choir}`);
	await expect(chips).toContainText('· Alt');

	await chips.getByRole('button', { name: 'Join a circle' }).click();
	const editor = editorOf(page, 'circles');
	await expect(editor.getByPlaceholder('Join or create a circle…')).toBeFocused();

	// A role saves when Enter is pressed in it.
	const role = editor.getByLabel(`Role in ${choir}`);
	await expect(role).toHaveValue('Alt');
	await role.fill('Sopran');
	await role.press('Enter');
	await expect(chips.getByRole('link', { name: new RegExp(choir) })).toContainText('· Sopran');

	// Leaving goes at once, and Undo brings the membership back.
	await editor.getByRole('button', { name: `Leave ${choir}` }).click();
	await expect(undoToast(page)).toContainText('Left the circle');
	await expect(chips.getByRole('link', { name: new RegExp(choir) })).toHaveCount(0);
	await undoToast(page).getByRole('button', { name: 'Undo' }).click();
	await expect(chips.getByRole('link', { name: new RegExp(choir) })).toBeVisible();

	// Joining, with a role, closes the editor and adds the chip.
	await editor.getByPlaceholder('Join or create a circle…').fill('Facettli Orchester');
	await editor.getByPlaceholder('role (optional)').last().fill('Geige');
	await editor.getByRole('button', { name: 'Join', exact: true }).click();
	await expect(chips.getByRole('link', { name: /Facettli Orchester/ })).toContainText('· Geige');
	await expect(editor).toHaveCount(0);
});

test('Kurt’s card has no last contact, and its quiet button names what is missing', async ({
	page
}) => {
	await openDemoPerson(page, KURT);
	await expect(facts(page).locator('[data-fact="birthday"]')).toBeVisible();
	await expect(facts(page).locator('[data-fact="last-contact"]')).toHaveCount(0);
	await expect(card(page).getByTestId('identity-add-more')).toHaveText(
		'Add address, phone, email …'
	);
});

/*
 * The language is stored in the profile, which every spec shares, so the case hands the
 * account back in English.
 */
test.describe('in German', () => {
	test.beforeEach(async ({ page }) => {
		await chooseLanguage(page, 'Deutsch', /^Einstellungen$/);
	});
	test.afterEach(async ({ page }) => {
		await chooseLanguage(page, 'English', /^Settings$/);
	});

	test('the quiet button, the slots and the + chip speak German', async ({ page }) => {
		await page.goto(`/contacts/${KURT}`);
		await expect(page.locator('#section-relationships')).toBeVisible();
		// The shell's search answers once the page is live — named in the language it speaks.
		await expect(page.getByRole('button', { name: 'Suche', exact: true })).toBeEnabled();
		const addMore = card(page).getByTestId('identity-add-more');
		await expect(addMore).toHaveText('Anschrift, Telefon, E-Mail … hinzufügen');
		await expect(facts(page).getByRole('button', { name: 'Einem Kreis beitreten' })).toBeVisible();

		await addMore.click();
		await expect(facts(page).getByRole('button', { name: 'Anschrift hinzufügen' })).toBeFocused();
	});
});

/** Picks a language in Settings and waits for the page to answer in it. */
async function chooseLanguage(page: Page, language: string, settled: RegExp): Promise<void> {
	await page.goto('/settings');
	await page.getByRole('button', { name: language }).click();
	await expect(page.getByRole('heading', { name: settled })).toBeVisible();
}

test.describe('on a phone the size of a Pixel 9 Pro', () => {
	test.use({ viewport: { width: 412, height: 915 }, hasTouch: true });

	test('no open editor runs off the side of the screen', async ({ page }) => {
		await openDemoPerson(page, MARKUS);
		const width = page.viewportSize()!.width;

		for (const [opener, fact] of [
			[facts(page).locator('[data-edit="dates"]').first(), 'dates'],
			[facts(page).locator('[data-edit="address"]'), 'address'],
			[facts(page).getByRole('button', { name: 'Join a circle' }), 'circles']
		] as const) {
			await opener.click();
			const editor = editorOf(page, fact);
			await expect(editor).toBeVisible();
			// The editor and every control in it, inside the screen — not merely clipped by a
			// card that hides what spills over.
			const edges = await editor.evaluate((box) =>
				[box, ...box.querySelectorAll('input:not([type=hidden]), select, textarea, button')].map(
					(el) => {
						const rect = el.getBoundingClientRect();
						return { left: rect.left, right: rect.right };
					}
				)
			);
			for (const edge of edges) {
				expect(edge.left).toBeGreaterThanOrEqual(0);
				expect(edge.right).toBeLessThanOrEqual(width);
			}
			await page.keyboard.press('Escape');
			await expect(editor).toHaveCount(0);
		}
	});
});

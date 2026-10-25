import { expect, test, type Locator, type Page } from '@playwright/test';
import { appReady, pickPerson, signIn } from './app';
import { LINK, personIdOf, seedHousehold } from './seed';

/*
 * A shared home (docs/02 §2.2, *A shared home*): one address for the people who live together,
 * entered with *Also lives here …* in the address's own frame, changed for everyone or for one,
 * and left with *Moved out*. Written after the owner tried it in the running app (docs/08
 * §8.4.1). Each case brings its own family, whom no other spec names; the homes themselves are
 * made through the editor, since sharing is what the first case is about.
 */

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

const facts = (page: Page) => page.getByTestId('identity-facts');
const addressFact = (page: Page) => facts(page).locator('[data-fact="address"]');
const editor = (page: Page) => page.locator('[data-fact-editor="address"]');
const undoToast = (page: Page) => page.getByTestId('toast-undo');

async function openSeeded(page: Page, name: string): Promise<void> {
	await page.goto(`/contacts/${personIdOf(name)}`);
	await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
	await appReady(page);
}

async function openAddressEditor(page: Page): Promise<Locator> {
	await addressFact(page)
		.getByRole('button', { name: /^Edit address/ })
		.click();
	await expect(editor(page)).toBeVisible();
	return editor(page);
}

/** *Also lives here …* in the address's frame, the people picked, then *Add*. */
async function share(frame: Locator, names: readonly string[]): Promise<void> {
	await frame.getByRole('button', { name: 'Also lives here …' }).click();
	const form = frame.getByTestId('share-home');
	// The Escape that closes the list stays in the picker: the address editor around it stays open.
	for (const name of names) await pickPerson(form.getByRole('combobox'), name);
	await expect(editor(frame.page())).toBeVisible();
	await form.getByRole('button', { name: 'Add', exact: true }).click();
}

test('an own address becomes a home: the one with the same line moves in, the one with another is asked about, and each name leads to its person', async ({
	page
}) => {
	const family = ['Hermine Hausfeld', 'Ottokar Hausfeld', 'Kuno Hausfeld', 'Wilma Hausfeld'];
	await seedHousehold(
		page,
		family,
		family.slice(1).map((to) => ({ from: family[0], to, type: LINK.siblingOf })),
		{},
		[],
		[],
		[],
		{},
		{},
		{
			'Hermine Hausfeld': 'Lindenweg 4\n3000 Bern',
			// The same line once case, spaces and punctuation are folded: simply moves in.
			'Kuno Hausfeld': 'lindenweg 4 3000 bern',
			'Wilma Hausfeld': 'Bergstrasse 9, 3000 Bern'
		}
	);
	await openSeeded(page, 'Hermine Hausfeld');

	// Nobody else lives there yet: the + is spelled out inside the address's frame.
	const frame = (await openAddressEditor(page)).locator('[data-address]');
	await expect(frame.getByTestId('share-open')).toHaveText('Also lives here …');
	await share(frame, ['Ottokar Hausfeld', 'Kuno Hausfeld', 'Wilma Hausfeld']);

	// Wilma's own address differs: asked once, in the same frame, before anything is written.
	const decide = editor(page).getByTestId('share-decide');
	await expect(decide).toContainText('Wilma Hausfeld has Bergstrasse 9, 3000 Bern');
	await expect(decide).not.toContainText('Kuno');
	await decide.getByRole('checkbox').check();
	await decide.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(editor(page)).toHaveCount(0);

	const livesWith = addressFact(page).locator('[data-lives-with]');
	await expect(addressFact(page)).toContainText('Lindenweg 4, 3000 Bern');
	for (const name of family.slice(1)) await expect(livesWith).toContainText(name);

	// A name is a way to that person, not a tap on the fact that opens the editor.
	await livesWith.getByRole('link', { name: 'Ottokar Hausfeld' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Ottokar Hausfeld' })).toBeVisible();
	await expect(addressFact(page)).toContainText('Lindenweg 4, 3000 Bern');
	await expect(addressFact(page).locator('[data-lives-with]')).toContainText('Hermine Hausfeld');

	// Replaced, Wilma's own address is gone; Kuno's copy too, folded into the home.
	for (const name of ['Wilma Hausfeld', 'Kuno Hausfeld']) {
		await openSeeded(page, name);
		await expect(addressFact(page)).toContainText('Lindenweg 4, 3000 Bern');
		await expect(addressFact(page)).not.toContainText('Bergstrasse');
		await expect(addressFact(page)).not.toContainText('lindenweg 4 3000 bern');
	}

	// Shared, the + after the housemates is round and says what it does to a screen reader only.
	await openAddressEditor(page);
	const plus = editor(page).locator('[data-home]').getByTestId('share-open');
	await expect(plus).toHaveAccessibleName('Also lives here …');
	await expect(plus).toHaveText('');
	await expect(editor(page).locator('[data-home]')).toContainText('Shared · 4 people');
	// The list's own actions sit below the frames, not in them.
	await expect(
		editor(page).locator('[data-home]').getByRole('button', { name: 'Add another address' })
	).toHaveCount(0);
	await expect(editor(page).getByRole('button', { name: 'Add another address' })).toBeVisible();
});

test('a changed line goes to everyone here, or moves only this person out with it', async ({
	page
}) => {
	await seedHousehold(
		page,
		['Agathe Umzug', 'Bruno Umzug'],
		[{ from: 'Agathe Umzug', to: 'Bruno Umzug', type: LINK.siblingOf }],
		{},
		[],
		[],
		[],
		{},
		{},
		{ 'Agathe Umzug': 'Rosenweg 1, 3000 Bern' }
	);
	await openSeeded(page, 'Agathe Umzug');
	await share((await openAddressEditor(page)).locator('[data-address]'), ['Bruno Umzug']);
	await expect(addressFact(page).locator('[data-lives-with]')).toContainText('Bruno Umzug');

	// For everyone, preselected.
	let home = (await openAddressEditor(page)).locator('[data-home]');
	await home.getByRole('textbox', { name: 'Address' }).fill('Rosenweg 2, 3000 Bern');
	await expect(home.getByRole('radio', { name: /^Everyone here/ })).toBeChecked();
	await home.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByTestId('toast-notice')).toContainText('Address changed for 2 people');
	await expect(addressFact(page)).toContainText('Rosenweg 2, 3000 Bern');

	// Only for Agathe: she moves out with the new line, Bruno keeps the home.
	home = (await openAddressEditor(page)).locator('[data-home]');
	await home.getByRole('textbox', { name: 'Address' }).fill('Rosenweg 3, 3000 Bern');
	await home.getByRole('radio', { name: 'Only for Agathe Umzug' }).check();
	await home.getByRole('button', { name: 'Save' }).click();
	await expect(addressFact(page)).toContainText('Rosenweg 3, 3000 Bern');
	await expect(addressFact(page).locator('[data-lives-with]')).toHaveCount(0);

	await openSeeded(page, 'Bruno Umzug');
	await expect(addressFact(page)).toContainText('Rosenweg 2, 3000 Bern');
	await expect(addressFact(page)).not.toContainText('Rosenweg 3');
});

test('a housemate’s × and Moved out each end one membership, and Undo brings it back', async ({
	page
}) => {
	await seedHousehold(
		page,
		['Clara Auszug', 'Dieter Auszug', 'Erna Auszug'],
		['Dieter Auszug', 'Erna Auszug'].map((to) => ({
			from: 'Clara Auszug',
			to,
			type: LINK.siblingOf
		})),
		{},
		[],
		[],
		[],
		{},
		{},
		{ 'Clara Auszug': 'Ahornweg 7, 3000 Bern' }
	);
	await openSeeded(page, 'Clara Auszug');
	await share((await openAddressEditor(page)).locator('[data-address]'), [
		'Dieter Auszug',
		'Erna Auszug'
	]);

	// The × on Dieter's chip: gone at once, back with Undo.
	const home = (await openAddressEditor(page)).locator('[data-home]');
	const dieter = home.getByRole('link', { name: 'Dieter Auszug' });
	await home.getByRole('button', { name: 'Mark Dieter Auszug as moved out' }).click();
	await expect(undoToast(page)).toContainText('Dieter Auszug moved out');
	await expect(dieter).toHaveCount(0);
	await undoToast(page).getByRole('button', { name: 'Undo' }).click();
	await expect(dieter).toBeVisible();

	// Moved out for Clara herself: the home leaves her page, Undo puts it back.
	await home.getByRole('button', { name: 'Moved out', exact: true }).click();
	await expect(undoToast(page)).toContainText('Clara Auszug moved out');
	await expect(editor(page).locator('[data-home]')).toHaveCount(0);
	await undoToast(page).getByRole('button', { name: 'Undo' }).click();
	await expect(editor(page).locator('[data-home]')).toBeVisible();
	await expect(editor(page).locator('[data-home]')).toContainText('Shared · 3 people');
});

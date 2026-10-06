import { expect, test, type Locator, type Page } from '@playwright/test';
import { appReady, openPerson, signIn } from './app';
import { AUTH_STATE_PATH } from './auth-state';
import { LINK, seedHousehold } from './seed';

/*
 * A person's gender, set in the editor behind their name and while adding them (docs/02 §2.2). Written
 * after the owner tried it in the running app (docs/08 §8.4.1).
 *
 * The profile case brings its own family, which no other spec names: Olga is the sister of
 * Kim's mother Ines, so Kim's page works out an aunt — or, with no gender on record, an aunt or
 * uncle. What the gender changes is seen where it matters, on the relative's page.
 */

const AUNT = 'Olga Aregger';
const MOTHER = 'Ines Aregger';
const CHILD = 'Kim Aregger';
const LONER = 'Pia Aregger';

// The stored session is enough without JavaScript; `signIn` waits for a shell that never mounts there.
test.beforeEach(async ({ page, javaScriptEnabled }) => {
	if (javaScriptEnabled) await signIn(page);
});

/** Opens the editor behind the name, where the gender is set (docs/02 §2.2). */
async function openNameEditor(page: Page): Promise<Locator> {
	await page.getByTitle('Edit name').click();
	const editor = page.getByTestId('name-editor');
	await expect(editor.getByRole('group', { name: 'Gender' })).toBeVisible();
	return editor;
}

/** Picks a gender in the open name editor; the radio itself is drawn as its label's chip. */
async function pickGender(editor: Locator, gender: string): Promise<void> {
	await editor.getByRole('group', { name: 'Gender' }).getByText(gender, { exact: true }).click();
	await expect(editor.getByRole('radio', { name: gender, exact: true })).toBeChecked();
}

test('sets a gender in the name editor, names relatives by it, and takes it back', async ({
	page
}) => {
	await seedHousehold(
		page,
		[AUNT, MOTHER, CHILD],
		[
			{ from: MOTHER, to: AUNT, type: LINK.siblingOf },
			{ from: MOTHER, to: CHILD, type: LINK.parentOf }
		]
	);

	// Nothing on record yet: the relative is named neutrally.
	await openPerson(page, new RegExp(CHILD));
	await expect(page.getByTestId('derived-kin')).toContainText(AUNT);
	await expect(page.getByTestId('derived-kin')).toContainText('Aunt or uncle');

	await openPerson(page, new RegExp(AUNT));
	let editor = await openNameEditor(page);
	await expect(editor.getByRole('radio', { name: 'Not on record', exact: true })).toBeChecked();

	await pickGender(editor, 'Female');
	await editor.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByTestId('toast-notice')).toContainText('Saved');
	await expect(editor).toHaveCount(0);

	// Kept, and it is the relative's wording that changed.
	await page.reload();
	editor = await openNameEditor(page);
	await expect(editor.getByRole('radio', { name: 'Female', exact: true })).toBeChecked();
	await page.keyboard.press('Escape');
	await openPerson(page, new RegExp(CHILD));
	const derived = page.getByTestId('derived-kin');
	await expect(derived).toContainText(AUNT);
	await expect(derived).toContainText('Aunt');
	await expect(derived).not.toContainText('Aunt or uncle');

	// Diverse keeps the wording neutral, like nothing on record.
	await openPerson(page, new RegExp(AUNT));
	editor = await openNameEditor(page);
	await pickGender(editor, 'Diverse');
	await editor.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(editor).toHaveCount(0);
	await openPerson(page, new RegExp(CHILD));
	await expect(page.getByTestId('derived-kin')).toContainText('Aunt or uncle');

	// *Not on record* takes the gender off the record.
	await openPerson(page, new RegExp(AUNT));
	editor = await openNameEditor(page);
	await expect(editor.getByRole('radio', { name: 'Diverse', exact: true })).toBeChecked();
	await pickGender(editor, 'Not on record');
	await editor.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(editor).toHaveCount(0);
	editor = await openNameEditor(page);
	await expect(editor.getByRole('radio', { name: 'Not on record', exact: true })).toBeChecked();
});

test('Escape closes the name editor without changing the gender', async ({ page }) => {
	// A person of its own: the seed adds each name once, and the case above owns the family.
	await seedHousehold(page, [LONER]);
	await openPerson(page, new RegExp(LONER));
	let editor = await openNameEditor(page);

	await pickGender(editor, 'Female');
	await page.keyboard.press('Escape');
	await expect(editor).toHaveCount(0);

	editor = await openNameEditor(page);
	await expect(editor.getByRole('radio', { name: 'Not on record', exact: true })).toBeChecked();
});

/*
 * The form's own action, which is what saves a person when the page runs without JavaScript;
 * with it, the form goes through the command outbox instead.
 */
test.describe('without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test('keeps the gender chosen while adding someone', async ({ page, browser }) => {
		await page.goto('/contacts/new');
		await page.getByLabel('First name').fill('Leonie');
		await page.getByLabel('Last name').fill('Zumstein');
		await page.getByText('Diverse', { exact: true }).click();
		await expect(page.getByRole('radio', { name: 'Diverse', exact: true })).toBeChecked();
		await page.getByRole('button', { name: 'Add person' }).click();

		await expect(page.getByRole('heading', { name: 'Leonie Zumstein' })).toBeVisible();
		// Read where it is edited, the name editor — which needs JavaScript to open.
		const reader = await browser.newContext({
			storageState: AUTH_STATE_PATH,
			javaScriptEnabled: true
		});
		const readerPage = await reader.newPage();
		await readerPage.goto(page.url());
		await appReady(readerPage);
		const editor = await openNameEditor(readerPage);
		await expect(editor.getByRole('radio', { name: 'Diverse', exact: true })).toBeChecked();
		await reader.close();
	});
});

test('asks for a gender while adding someone, and lets a second tap take the choice back', async ({
	page
}) => {
	await page.goto('/contacts/new');
	await appReady(page);
	await page.getByLabel('First name').fill('Nora');
	await page.getByLabel('Last name').fill('Zumstein');

	const male = page.getByRole('radio', { name: 'Male', exact: true });
	await page.getByText('Male', { exact: true }).click();
	await expect(male).toBeChecked();
	await page.getByText('Male', { exact: true }).click();
	await expect(male).not.toBeChecked();

	await page.getByText('Female', { exact: true }).click();
	await expect(page.getByRole('radio', { name: 'Female', exact: true })).toBeChecked();
	await page.getByRole('button', { name: 'Add person' }).click();

	await expect(page.getByRole('heading', { name: 'Nora Zumstein' })).toBeVisible();
	await appReady(page);
	const editor = await openNameEditor(page);
	await expect(editor.getByRole('radio', { name: 'Female', exact: true })).toBeChecked();
});

import { expect, test, type Page } from '@playwright/test';
import { appReady, signIn } from './app';

/*
 * Namesakes in the @-picker and when someone is named for the first time (docs/02 §2.2.3,
 * §2.20.1, §2.22.1). Written after the maintainer checked the flows in the running app
 * (docs/08 §8.4.1).
 *
 * The suite shares one database, so every case makes its own people under a name no other
 * attempt shares: two people called the same, told apart only by their description, and a
 * person with a full name to write notes and journal entries on.
 */

/** Six letters no other attempt shares, so a name made from them is this attempt's alone. */
function runLetters(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) => String.fromCharCode(97 + (byte % 26))).join('');
}

/** The id of the person whose page is showing. */
function personId(page: Page): string {
	const id = /\/contacts\/([^/?#]+)/.exec(page.url())?.[1];
	if (!id) throw new Error(`not on a person page: ${page.url()}`);
	return id;
}

/** Adds a person through *Add a person* and returns their id. */
async function addPerson(page: Page, first: string, rest: { last?: string; description?: string }): Promise<string> {
	await page.goto('/contacts/new');
	await appReady(page);
	await page.getByLabel('First name').fill(first);
	if (rest.last) await page.getByLabel('Last name').fill(rest.last);
	if (rest.description) await page.getByLabel(/^Description/).fill(rest.description);
	await page.getByRole('button', { name: 'Add person' }).click();
	const heading = rest.last ? `${first} ${rest.last}` : first;
	await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
	return personId(page);
}

const HUT = 'Hut warden at the Blüemlisalp';
const LAKE = 'Swims at the Marzili';

/** Two people with the same first name and nothing but a description between them. */
async function twoNamesakes(page: Page) {
	const name = `Ruedi${runLetters()}`;
	const hut = await addPerson(page, name, { description: HUT });
	const lake = await addPerson(page, name, { description: LAKE });
	return { name, hut, lake };
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('says which namesake is which in the @-picker, and the moment goes to the one picked', async ({ page }) => {
	const { name, lake } = await twoNamesakes(page);
	await page.goto('/');
	await appReady(page);

	const field = page.getByLabel('What happened?');
	await field.pressSequentially(`Coffee with @${name}`);
	const listed = page.getByRole('option', { name: new RegExp(`^${name}`) });
	await expect(listed.filter({ hasText: HUT })).toHaveCount(1);
	await expect(listed.filter({ hasText: LAKE })).toHaveCount(1);

	// The text reads the same for both; the pick is what says which one.
	await listed.filter({ hasText: LAKE }).click();
	await expect(field).toHaveValue(`Coffee with @${name} `);
	await field.pressSequentially('by the river');
	await page.getByRole('button', { name: /^Save/ }).click();

	const moment = page.locator('article').filter({ hasText: 'by the river' });
	await expect(moment.locator(`a[href="/contacts/${lake}"]`).first()).toBeVisible();
});

test('asks which one when a namesake is typed rather than picked, keeping the text', async ({ page }) => {
	const { name } = await twoNamesakes(page);
	await addPerson(page, 'Anneliese', { last: `Gfeller${runLetters()}` });

	await page.getByRole('button', { name: 'Add note' }).click();
	const field = page.getByRole('textbox', { name: 'Note' });
	await field.pressSequentially(`Called @${name}`);
	await field.press('Escape');
	await page.getByRole('button', { name: 'Add note' }).click();

	const refusal = page.getByText(new RegExp(`@${name} could be 2 people`));
	await expect(refusal).toBeVisible();
	await expect(refusal).toContainText(HUT);
	await expect(refusal).toContainText(LAKE);
	await expect(field).toHaveValue(`Called @${name}`);
});

test('keeps a namesake mentioned when a journal entry is edited and saved', async ({ page }) => {
	const { name, hut } = await twoNamesakes(page);
	const subject = await addPerson(page, 'Anneliese', { last: `Gfeller${runLetters()}` });
	await page.goto(`/contacts/${subject}/journal`);
	await appReady(page);

	await page.getByRole('button', { name: 'New entry' }).click();
	const field = page.getByRole('textbox', { name: 'Entry' });
	await field.pressSequentially(`Walked with @${name}`);
	await page.getByTestId('mention-picker').getByRole('option').filter({ hasText: HUT }).click();
	await page.getByRole('button', { name: 'Save entry' }).click();
	const chip = page.locator(`a.mention[href="/contacts/${hut}"]`);
	await expect(chip).toBeVisible();

	// Editing shows the handle again; saving must not lose whom it names.
	await page.getByRole('button', { name: 'Edit entry' }).click();
	const editing = page.getByRole('textbox', { name: 'Entry' });
	await expect(editing).toHaveValue(`Walked with @${name}`);
	await editing.press('End');
	await editing.pressSequentially(' again');
	await page.getByRole('button', { name: 'Save changes' }).click();
	await expect(page.getByText('again')).toBeVisible();
	await expect(chip).toBeVisible();
});

test('creates another namesake from a moment, only with something to know them by', async ({ page }) => {
	const { name } = await twoNamesakes(page);
	await page.goto('/');
	await appReady(page);

	await page.getByLabel('What happened?').pressSequentially(`Lunch with @${name}`);
	await page.getByRole('option', { name: `Create another “${name}”` }).click();
	const panel = page.getByTestId('composer-create');
	await expect(panel.getByTestId('know-them-by')).toContainText(`“${name}”`);
	const add = panel.getByRole('button', { name: 'Add to the moment' });
	await expect(add).toBeDisabled();

	await panel.getByLabel('Description').fill('Plays the alphorn');
	await add.click();
	await page.getByLabel('What happened?').pressSequentially('at the Gurten');
	await page.getByRole('button', { name: /^Save/ }).click();

	const moment = page.locator('article').filter({ hasText: 'at the Gurten' });
	await moment.getByRole('link', { name, exact: true }).first().click();
	await expect(page.getByText('Plays the alphorn')).toBeVisible();
});

test('describes someone new in the relationship form by the link being entered', async ({ page }) => {
	const last = `Gfeller${runLetters()}`;
	await addPerson(page, 'Anneliese', { last });

	await page.getByRole('button', { name: 'Add relationship' }).click();
	const form = page.locator('form[action="?/addRelationship"]');
	await form.locator('select[name="typeChoice"]').selectOption({ label: 'Parent of' });
	await form.getByLabel('Person').fill(`Wendelin${runLetters()}`);
	await page.getByTestId('person-search-create-option').click();

	const description = page.getByTestId('person-search-create').getByLabel('Description');
	await expect(description).toHaveValue(`Child of Anneliese ${last}`);
	await form.locator('select[name="typeChoice"]').selectOption({ label: 'Friend of' });
	await expect(description).toHaveValue(`Friend of Anneliese ${last}`);
});

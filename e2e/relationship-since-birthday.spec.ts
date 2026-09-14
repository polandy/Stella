import { expect, test, type Locator, type Page } from '@playwright/test';
import { appReady, openPerson, pickPerson, signIn } from './app';

/*
 * The since day a new family link starts out with (docs/02 §2.4). Written after the flow was
 * verified in the running app (docs/08 §8.4.1).
 *
 * The suite shares one demo database, so the cases that only read the suggestion never submit
 * the form — they fill nothing in but the picker and read the day back out. The one case that
 * does save works on people it names itself, absent from the seed and from every other spec.
 */

/** The day the form would post: the field's own hidden value, in ISO. */
const sinceValue = (form: Locator) => form.locator('input[name=sinceDate]');

/** Opens the *Add relationship* form on the person page currently shown. */
async function openRelationshipForm(page: Page): Promise<Locator> {
	await page.getByRole('button', { name: 'Add relationship' }).click();
	const form = page.locator('form[action="?/addRelationship"]');
	await expect(form).toBeVisible();
	return form;
}

/** Says the link without saving it: a kind of link and the person at its other end. */
async function say(form: Locator, type: string, person: string): Promise<void> {
	await form.locator('select[name=typeChoice]').selectOption({ label: type });
	await pickPerson(form.getByLabel('Person'), person);
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('dates a parent–child link from the child, whichever side the sentence is read from', async ({
	page
}) => {
	// Bettina Roth was born 15 December 1990, Jan Steiner 14 July 2017.
	await openPerson(page, /Bettina Roth/);
	const form = await openRelationshipForm(page);

	// "Bettina is a parent of Jan" — the other one is the child, so it is his birthday.
	await say(form, 'Parent of', 'Jan Steiner');
	await expect(sinceValue(form)).toHaveValue('2017-07-14');

	// And it is a filled-in field, not just a hidden value: the day is on screen to correct.
	const since = form.getByRole('group', { name: 'Since' });
	await expect(since.getByLabel('Day', { exact: true })).toHaveValue('14');
	await expect(since.getByLabel('Month', { exact: true })).toHaveValue('7');
	await expect(since.getByLabel('Year', { exact: true })).toHaveValue('2017');

	// "Bettina is a child of Kurt" — now she is the child, and it is her own birthday.
	await say(form, 'Child of', 'Kurt Lehmann');
	await expect(sinceValue(form)).toHaveValue('1990-12-15');
});

test('dates a sibling link from the later birth, and suggests nothing outside the family', async ({
	page
}) => {
	// Neither side of "Sibling of" says who is older, so the two birthdays decide: Bettina Roth
	// 1990, Jan Steiner 2017.
	await openPerson(page, /Bettina Roth/);
	const form = await openRelationshipForm(page);
	await say(form, 'Sibling of', 'Jan Steiner');
	await expect(sinceValue(form)).toHaveValue('2017-07-14');

	// A partnership begins at a meeting or a wedding, which no birthday knows — so the same
	// two people, retyped, leave the day to whoever is entering the link.
	await form.locator('select[name=typeChoice]').selectOption({ label: 'Partner of' });
	await expect(sinceValue(form)).toHaveValue('');
	await expect(form.getByRole('group', { name: 'Since' }).getByLabel('Year', { exact: true })).toHaveValue('');
});

test('dates the link from a child named in the picker itself, and saves that day', async ({
	page
}) => {
	// Both people are named here: nobody else's page changes.
	await page.goto('/contacts/new');
	await page.getByLabel('First name').fill('Judith');
	await page.getByLabel('Last name').fill('Amrein-Stalder');
	await page.getByRole('button', { name: 'Add person' }).click();
	await expect(page.getByRole('heading', { name: 'Judith Amrein-Stalder' })).toBeVisible();
	await appReady(page);

	const form = await openRelationshipForm(page);
	await form.locator('select[name=typeChoice]').selectOption({ label: 'Parent of' });

	const field = form.getByLabel('Person');
	await field.click();
	await field.fill('Yannik Amrein');
	await page.getByTestId('person-search-create-option').click();

	const panel = page.getByTestId('person-search-create');
	await panel.getByText('More details').click();
	const birthday = panel.getByRole('group', { name: 'Birthday' });
	await birthday.getByLabel('Day', { exact: true }).fill('5');
	await birthday.getByLabel('Month', { exact: true }).selectOption('3');
	await birthday.getByLabel('Year', { exact: true }).fill('2021');
	await page.getByRole('button', { name: 'Add & select' }).click();
	await expect(page.getByTestId('toasts')).toContainText('Yannik Amrein was added');

	// A person Stella learned a moment ago is not in the page's list, and the day still arrives.
	await expect(sinceValue(form)).toHaveValue('2021-03-05');

	// Saved as offered, rather than dropped on the way to the server.
	await form.getByRole('button', { name: 'Add', exact: true }).click();
	const row = page
		.locator('#section-relationships ul')
		.first()
		.locator('li')
		.filter({ hasText: 'Yannik Amrein' });
	await expect(row).toContainText('since 5 March 2021');
	await page.reload();
	await expect(row).toContainText('since 5 March 2021');
});

test('leaves the type picker standing on its first entry, which an untouched form still posts', async ({
	page
}) => {
	/*
	 * Watching the picker must not take it over: a value of its own before anybody has chosen
	 * would deselect every option, and the form would post no type at all. Both people are
	 * named here, and the type is deliberately never touched.
	 */
	await page.goto('/contacts/new');
	await page.getByLabel('First name').fill('Regula');
	await page.getByLabel('Last name').fill('Bachmann-Hodel');
	await page.getByRole('button', { name: 'Add person' }).click();
	await expect(page.getByRole('heading', { name: 'Regula Bachmann-Hodel' })).toBeVisible();
	await appReady(page);

	const form = await openRelationshipForm(page);
	await expect(form.locator('select[name=typeChoice] option:checked')).toHaveText('Parent of');

	const field = form.getByLabel('Person');
	await field.click();
	await field.fill('Tobias Hodel');
	await page.getByTestId('person-search-create-option').click();
	await page.getByRole('button', { name: 'Add & select' }).click();
	await expect(page.getByTestId('toasts')).toContainText('Tobias Hodel was added');

	await form.getByRole('button', { name: 'Add', exact: true }).click();
	const row = page
		.locator('#section-relationships ul')
		.first()
		.locator('li')
		.filter({ hasText: 'Tobias Hodel' });
	await expect(row).toContainText('Parent of');
});

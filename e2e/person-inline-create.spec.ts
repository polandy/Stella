import { expect, test, type Locator, type Page } from '@playwright/test';
import { signIn } from './app';

/*
 * Naming a new person from inside a person picker (docs/02 §2.2.2). Written after the panel
 * was seen in the running app (docs/08 §8.4.1).
 *
 * The suite shares one database, so every name here is absent from the demo seed and from
 * every other spec, and each case adds the person whose page it works on. Nothing this file
 * writes lands on a seeded person another case asserts about.
 */

/** Adds a person through the quick-add page and lands on their page. */
async function addPerson(page: Page, first: string, last: string): Promise<void> {
	await page.goto('/contacts/new');
	await page.getByLabel('First name').fill(first);
	await page.getByLabel('Last name').fill(last);
	await page.getByRole('button', { name: 'Add person' }).click();
	await expect(page.getByRole('heading', { name: `${first} ${last}` })).toBeVisible();
}

/** Opens the *Add relationship* form on the person page currently shown. */
async function openRelationshipForm(page: Page): Promise<Locator> {
	await page.getByRole('tab', { name: /People/ }).click();
	await page.getByRole('button', { name: 'Add relationship' }).click();
	return page.locator('form[action="?/addRelationship"]');
}

const createRow = (page: Page) => page.getByTestId('person-search-create-option');

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('offers the typed name only once it is long enough to be one, and never as a person', async ({
	page
}) => {
	await addPerson(page, 'Ramona', 'Tschudi');
	const form = await openRelationshipForm(page);
	const field = form.getByLabel('Person');
	await field.click();

	// One character is still mid-typing: the offer would be noise.
	await field.fill('B');
	await expect(createRow(page)).toHaveCount(0);

	await field.fill('Bo');
	await expect(createRow(page)).toBeVisible();

	// It is an action, not a person: the listbox stays a list of people, and an empty search
	// leaves it empty. (Scoped to the picker — the relationship-type `<select>` beside it has
	// options of its own.)
	await field.fill('Wendelin Pfyffer');
	await expect(page.getByTestId('person-search-listbox').getByRole('option')).toHaveCount(0);
	await expect(page.getByText('No one found.')).toBeVisible();
	await expect(createRow(page)).toContainText('Wendelin Pfyffer');
});

test('names a stranger from the relationship picker and links them without leaving the page', async ({
	page
}) => {
	await addPerson(page, 'Silvan', 'Ineichen-Wyss');
	const form = await openRelationshipForm(page);

	const field = form.getByLabel('Person');
	await field.click();
	await field.fill('Malia Buchser');
	await createRow(page).click();

	const panel = page.getByTestId('person-search-create');
	await expect(panel).toBeVisible();
	// The query is split at the first space, so neither name has to be typed twice.
	await expect(panel.getByLabel('First name')).toHaveValue('Malia');
	await expect(panel.getByLabel('Last name')).toHaveValue('Buchser');

	await page.getByRole('button', { name: 'Add & select' }).click();
	await expect(page.getByTestId('toasts')).toContainText('Malia Buchser was added');

	// Selected, not merely created: submitting the form links the person just named.
	await form.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.locator('#panel-people')).toContainText('Malia Buchser');

	// And she is a real person with her own page, reachable from the link just written.
	await page.locator('#panel-people').getByRole('link', { name: 'Malia Buchser' }).first().click();
	await expect(page.getByRole('heading', { name: 'Malia Buchser' })).toBeVisible();
});

test('keeps a birthday whose year nobody knows, which a native date input cannot express', async ({
	page
}) => {
	await addPerson(page, 'Fabienne', 'Marolf');
	const form = await openRelationshipForm(page);

	const field = form.getByLabel('Person');
	await field.click();
	await field.fill('Orell Zumstein');
	await createRow(page).click();

	const panel = page.getByTestId('person-search-create');
	await panel.getByText('More details').click();
	const birthday = panel.getByRole('group', { name: 'Birthday' });
	await birthday.getByLabel('Day', { exact: true }).fill('24');
	await birthday.getByLabel('Month', { exact: true }).selectOption('12');
	// The year is deliberately left blank.

	await page.getByRole('button', { name: 'Add & select' }).click();
	await expect(page.getByTestId('toasts')).toContainText('Orell Zumstein was added');

	await page.goto('/contacts');
	await page.getByRole('link', { name: 'Orell Zumstein' }).first().click();
	// Rendered without a year rather than with an invented one.
	await expect(page.getByText('24 December', { exact: false })).toBeVisible();
});

test('returns to the search when the panel is dismissed, having created nobody', async ({
	page
}) => {
	await addPerson(page, 'Corina', 'Hubacher');
	const form = await openRelationshipForm(page);

	const field = form.getByLabel('Person');
	await field.click();
	await field.fill('Anouk Zollinger');
	await createRow(page).click();
	await expect(page.getByTestId('person-search-create')).toBeVisible();

	await page.getByTestId('person-search-create').getByRole('button', { name: 'Cancel' }).click();
	await expect(page.getByTestId('person-search-create')).toHaveCount(0);
	await expect(page.getByTestId('person-search-listbox')).toBeVisible();

	// Nobody by that name exists, so the search still finds no one — the positive control is
	// the offer still standing beside that emptiness.
	await expect(page.getByText('No one found.')).toBeVisible();
	await expect(createRow(page)).toBeVisible();
	await page.goto('/contacts');
	await expect(page.getByRole('link', { name: 'Anouk Zollinger' })).toHaveCount(0);
});

test('does not offer to invent a person when choosing which duplicate to merge in', async ({
	page
}) => {
	await addPerson(page, 'Ladina', 'Cadonau');

	await page.getByRole('button', { name: 'Merge someone into this person' }).click();
	const form = page.locator('form[action="?/merge"]');
	const field = form.getByLabel('Who is the same person?');
	await field.click();
	await field.fill('Ravi Sandoz');

	// A person who did not exist a moment ago cannot be this one's duplicate.
	await expect(page.getByText('No one found.')).toBeVisible();
	await expect(createRow(page)).toHaveCount(0);

	// The positive control: the same field does offer the people who do exist.
	await field.fill('Bettina');
	await expect(page.getByRole('option', { name: 'Bettina Roth' })).toBeVisible();
});

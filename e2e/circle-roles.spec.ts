import { expect, test, type Page } from '@playwright/test';
import { addPerson, appReady, pickPerson, profileRow, signIn } from './app';

/*
 * The roles a circle already uses are offered to whoever joins it next (docs/02 §2.4.2).
 * Written after the screens were seen in the running app (docs/08 §8.4.1). Every case builds
 * its own circles out of people it invents, so none of it reads back another case's data or
 * disturbs the demo household the other specs measure.
 */

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

/** Creates a circle through the Circles page and lands on it. */
async function newCircle(page: Page, name: string): Promise<void> {
	await page.goto('/circles');
	// *New circle* is a disclosure, so it only answers once the shell has mounted.
	await appReady(page);
	await page.getByRole('button', { name: 'New circle' }).click();
	await page.getByLabel('Name').fill(name);
	await page.getByRole('button', { name: 'Create circle' }).click();
	await expect(page.getByRole('heading', { name })).toBeVisible();
}

/** Puts one person into the circle whose page is open, under the role given. */
async function addMember(page: Page, person: string, role: string): Promise<void> {
	await page.getByRole('button', { name: 'Add people' }).click();
	const form = page.locator('form[action="?/addMembers"]');
	await pickPerson(form.getByLabel('People'), person);
	await form.getByLabel('Role (optional)').fill(role);
	await form.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByTestId('member-grid').getByRole('link', { name: person })).toBeVisible();
}

/** The role field's suggestions, in the order the reader is offered them. */
function roleOptions(page: Page) {
	return page.locator('#circle-roles option');
}

test('a circle offers the roles it already uses to the next person joining it, commonest first', async ({
	page
}) => {
	await addPerson(page, 'Tamar', 'Vogler');
	await addPerson(page, 'Enzo', 'Vogler');
	await addPerson(page, 'Pia', 'Grundler');

	await newCircle(page, 'Lantern Rowing Club');
	await addMember(page, 'Tamar Vogler', 'cox');
	await addMember(page, 'Enzo Vogler', 'rower');
	await addMember(page, 'Pia Grundler', 'rower');

	await page.getByRole('button', { name: 'Add people' }).click();
	const role = page.locator('form[action="?/addMembers"]').getByLabel('Role (optional)');
	// The field is the one being suggested into, not a lookalike beside it.
	await expect(role).toHaveAttribute('list', 'circle-roles');

	// Two roles from three memberships, and the one two people share leads.
	await expect(roleOptions(page)).toHaveCount(2);
	await expect(roleOptions(page).nth(0)).toHaveAttribute('value', 'rower');
	await expect(roleOptions(page).nth(1)).toHaveAttribute('value', 'cox');
});

test('on a person’s page the roles follow the circle name typed, in any capitalisation', async ({
	page
}) => {
	await addPerson(page, 'Odile', 'Kranzler');
	await addPerson(page, 'Ruben', 'Kranzler');

	await newCircle(page, 'Harbour Chess Club');
	await addMember(page, 'Odile Kranzler', 'arbiter');
	await newCircle(page, 'Harbour Kite Club');
	await addMember(page, 'Ruben Kranzler', 'wing');

	// A third person, so the form offers circles they are not in yet.
	await addPerson(page, 'Marlis', 'Zbinden');
	const circles = await profileRow(page, 'Circles');
	await circles.getByRole('button', { name: 'Join' }).click();
	const name = circles.getByPlaceholder('Join or create a circle…');

	await name.fill('Harbour Chess Club');
	await expect(roleOptions(page)).toHaveCount(1);
	await expect(roleOptions(page).nth(0)).toHaveAttribute('value', 'arbiter');

	// The other circle's role, and the name typed the way nobody capitalises it.
	await name.fill('harbour kite club');
	await expect(roleOptions(page)).toHaveCount(1);
	await expect(roleOptions(page).nth(0)).toHaveAttribute('value', 'wing');

	// A circle that does not exist suggests nothing — the two assertions above are what says
	// this locator can find options at all.
	await name.fill('Harbour Bridge Club');
	await expect(roleOptions(page)).toHaveCount(0);
});

test('one role, not two, when the household has spelled it both ways', async ({ page }) => {
	await addPerson(page, 'Sieglinde', 'Amrein');
	await addPerson(page, 'Corin', 'Amrein');
	await addPerson(page, 'Vreni', 'Amrein');

	await newCircle(page, 'Lantern Kayak Club');
	await addMember(page, 'Sieglinde Amrein', 'guide');
	await addMember(page, 'Corin Amrein', 'guide');
	// The same role, typed the way it starts a sentence.
	await addMember(page, 'Vreni Amrein', 'Guide');

	await page.getByRole('button', { name: 'Add people' }).click();
	await expect(roleOptions(page)).toHaveCount(1);
	// Three memberships fold into one role, under the spelling this household writes most.
	await expect(roleOptions(page).nth(0)).toHaveAttribute('value', 'guide');
});

test('a role the circle has never used is still free to type', async ({ page }) => {
	await addPerson(page, 'Malin', 'Brechbühl');
	await addPerson(page, 'Joscha', 'Brechbühl');

	await newCircle(page, 'Lantern Sailing Club');
	await addMember(page, 'Malin Brechbühl', 'helm');

	// Nothing offers "bowman"; it is typed over the suggestion list and saved all the same.
	await addMember(page, 'Joscha Brechbühl', 'bowman');
	await expect(page.getByTestId('member-grid')).toContainText('bowman');

	await page.getByRole('button', { name: 'Add people' }).click();
	await expect(roleOptions(page)).toHaveCount(2);
});

import { expect, test, type Page } from '@playwright/test';
import { addPerson, appReady, signIn } from './app';

/*
 * Filling a circle from one search, and changing the role of several members at once
 * (docs/02 §2.4.2). Written after the screens were seen in the running app (docs/08 §8.4.1).
 * Every case invents its own people and circle, so none reads another case's data or disturbs
 * the demo household the other specs measure.
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

/** Puts people into the circle whose page is open, one pick and one role for all of them. */
async function addMembers(page: Page, people: string[], role: string): Promise<void> {
	await page.getByRole('button', { name: 'Add people' }).click();
	const form = page.locator('form[action="?/addMembers"]');
	const search = form.getByLabel('People');
	for (const person of people) {
		await search.fill(person);
		await page.getByRole('option', { name: person }).click();
		await expect(form.getByRole('button', { name: `Remove ${person}` })).toBeVisible();
	}
	await form.getByLabel('Role (optional)').fill(role);
	await form.getByRole('button', { name: 'Add', exact: true }).click();
	for (const person of people) {
		await expect(page.getByTestId('member-grid').getByRole('link', { name: person })).toBeVisible();
	}
}

/**
 * A family of three under a surname of its own, and someone outside it. The household is shared
 * by every case, so each case brings a surname no other uses — otherwise the second case would
 * find two Aurels and could not say which one it meant.
 */
async function family(
	page: Page,
	surname: string,
	outsider: string
): Promise<{ aurel: string; britta: string; cyrill: string; dario: string }> {
	await addPerson(page, 'Aurel', surname);
	await addPerson(page, 'Britta', surname);
	await addPerson(page, 'Cyrill', surname);
	await addPerson(page, 'Dario', outsider);
	return {
		aurel: `Aurel ${surname}`,
		britta: `Britta ${surname}`,
		cyrill: `Cyrill ${surname}`,
		dario: `Dario ${outsider}`
	};
}

test('the search stays after picking someone, so the rest of the family is one click away', async ({
	page
}) => {
	const f = await family(page, 'Lindenmann', 'Zbinden');
	await newCircle(page, 'Lantern Family Table');

	await page.getByRole('button', { name: 'Add people' }).click();
	const form = page.locator('form[action="?/addMembers"]');
	const search = form.getByLabel('People');
	await search.fill('Lindenmann');
	const options = page.getByTestId('person-search-listbox').getByRole('option');
	await expect(options).toHaveCount(3);
	await options.filter({ hasText: f.aurel }).click();

	// The positive signal first: Aurel is held as a chip, so the pick did land.
	await expect(form.getByRole('button', { name: `Remove ${f.aurel}` })).toBeVisible();
	await expect(search).toHaveValue('Lindenmann');
	// The two who are still missing are listed, the one just picked is not, and Dario never matched.
	await expect(options).toHaveCount(2);
	await expect(options.filter({ hasText: f.britta })).toBeVisible();
	await expect(options.filter({ hasText: f.cyrill })).toBeVisible();
});

test('"Add all" takes every match of the search at once', async ({ page }) => {
	const f = await family(page, 'Eggimann', 'Rothen');
	await newCircle(page, 'Lantern Family Picnic');

	await page.getByRole('button', { name: 'Add people' }).click();
	const form = page.locator('form[action="?/addMembers"]');
	await form.getByLabel('People').fill('Eggimann');
	await page.getByRole('button', { name: 'Add all 3' }).click();

	for (const person of ['Aurel', 'Britta', 'Cyrill']) {
		await expect(form.getByRole('button', { name: `Remove ${person} Eggimann` })).toBeVisible();
	}
	await form.getByRole('button', { name: 'Add', exact: true }).click();

	const grid = page.getByTestId('member-grid');
	await expect(grid.getByRole('link', { name: f.cyrill })).toBeVisible();
	await expect(grid.getByRole('link')).toHaveCount(3);
});

test('with the switch off the search empties after a pick, and the choice is remembered', async ({
	page
}) => {
	const f = await family(page, 'Zaugg', 'Bieri');
	await newCircle(page, 'Lantern Family Walk');

	await page.getByRole('button', { name: 'Add people' }).click();
	const form = page.locator('form[action="?/addMembers"]');
	const keep = form.getByLabel('Keep the search after picking someone');
	await expect(keep).toBeChecked();
	await keep.uncheck();

	const search = form.getByLabel('People');
	await search.fill('Zaugg');
	await page.getByRole('option', { name: f.aurel }).click();
	await expect(form.getByRole('button', { name: `Remove ${f.aurel}` })).toBeVisible();
	await expect(search).toHaveValue('');

	// A fresh visit still has it off: it is a habit of this browser, not of this form.
	await page.reload();
	await appReady(page);
	await page.getByRole('button', { name: 'Add people' }).click();
	await expect(
		page.locator('form[action="?/addMembers"]').getByLabel('Keep the search after picking someone')
	).not.toBeChecked();
});

test('several members get one role together, and move to their new group', async ({ page }) => {
	const f = await family(page, 'Rufener', 'Kaeser');
	await newCircle(page, 'Lantern Choir Bench');
	await addMembers(page, [f.aurel, f.britta, f.cyrill], 'guest');
	// A second role keeps the headings on the page once everyone has moved.
	await addMembers(page, [f.dario], 'host');

	await page.getByRole('button', { name: 'Select', exact: true }).click();
	await page.getByLabel(`Select ${f.aurel}`).check();
	await page.getByLabel(`Select ${f.britta}`).check();
	const bar = page.getByTestId('selection-bar');
	await expect(bar).toContainText('2 selected');

	await bar.getByLabel('Set role').fill('cook');
	await bar.getByRole('button', { name: 'Apply' }).click();

	await expect(page.getByRole('heading', { name: 'cook · 2' })).toBeVisible();
	// Cyrill stayed put, and the two who moved left "guest" behind.
	await expect(page.getByRole('heading', { name: 'guest · 1' })).toBeVisible();
	await expect(bar).toContainText('Nobody selected');
});

test('a whole role is selected with its "all" box, and an empty role takes the role away', async ({
	page
}) => {
	const f = await family(page, 'Sterchi', 'Wittwer');
	await newCircle(page, 'Lantern Choir Row');
	await addMembers(page, [f.aurel, f.britta], 'guest');
	await addMembers(page, [f.cyrill], 'host');

	await page.getByRole('button', { name: 'Select', exact: true }).click();
	await page.getByLabel('Select all in guest').check();
	const bar = page.getByTestId('selection-bar');
	await expect(bar).toContainText('2 selected');

	await bar.getByRole('button', { name: 'Apply' }).click();

	await expect(page.getByRole('heading', { name: 'No role · 2' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'host · 1' })).toBeVisible();
});

test('selected members leave together, each with its own way back', async ({ page }) => {
	const f = await family(page, 'Oesch', 'Leuenberger');
	await newCircle(page, 'Lantern Choir Exit');
	await addMembers(page, [f.aurel, f.britta, f.cyrill], 'guest');

	await page.getByRole('button', { name: 'Select', exact: true }).click();
	await page.getByLabel(`Select ${f.aurel}`).check();
	await page.getByLabel(`Select ${f.britta}`).check();
	await page.getByTestId('selection-bar').getByRole('button', { name: 'Remove' }).click();

	// Cyrill is the positive signal that the grid is still there while the two are gone.
	const grid = page.getByTestId('member-grid');
	await expect(grid).toContainText(f.cyrill);
	await expect(grid).not.toContainText(f.aurel);
	await expect(grid).not.toContainText(f.britta);

	// Undo brings one back without touching the other.
	await page.getByRole('button', { name: 'Undo' }).first().click();
	await expect(grid.locator('li')).toHaveCount(2);
	await expect(grid).toContainText(f.cyrill);
});

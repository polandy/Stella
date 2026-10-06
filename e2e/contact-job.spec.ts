import { expect, test, type Page } from '@playwright/test';
import { identityRow, openPeople, openPerson, pickPerson, signIn } from './app';
import { seedHousehold } from './seed';

/*
 * A person's job title and company (docs/02 §2.2, §2.9): edited where they are read — among
 * the identity card's facts, or in its *Job* row while nothing is on record — and found by in
 * the People list, the search and the person picker, with a *Job* tag when only the job
 * explains the hit. Written after the owner tried it on the phone (docs/08 §8.4.1).
 *
 * Every case brings its own people, with jobs no demo person has, so no case reads another's
 * data (the restore seed adds each name once).
 */

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

/** Seeds people with the jobs a case starts from — the setting, not the step under test. */
async function seedPeople(
	page: Page,
	people: readonly string[],
	jobs: Readonly<Record<string, { title?: string; company?: string }>> = {}
): Promise<void> {
	await seedHousehold(page, people, [], {}, [], [], [], {}, jobs);
}

/** The job among the identity card's facts, which is the button that opens its editor. */
const factJob = (page: Page) => page.getByTestId('person-job');
const factJobButton = (page: Page) => page.getByRole('button').filter({ has: factJob(page) });

test('sets job and company from the row behind the quiet button, then edits them among the facts', async ({
	page
}) => {
	const person = 'Mirja Quellbach';
	await seedPeople(page, [person]);
	await openPerson(page, new RegExp(person));

	// Nothing on record: the row waits behind the identity card's quiet button, and the facts
	// state no job.
	const row = await identityRow(page, page.locator('[data-row="job"]'));
	await expect(row).toContainText('Not on record');
	await expect(factJob(page)).toHaveCount(0);

	await row.getByRole('button', { name: /^Job/ }).click();
	const editor = row.getByTestId('job-editor');
	await editor.getByLabel('Job title').fill('Uhrmacherin');
	await editor.getByLabel('Company / organisation').fill('Zahnradwerk Quellbach');
	await editor.getByRole('button', { name: 'Save' }).click();

	await expect(page.getByTestId('toast-notice')).toContainText('Saved');
	await expect(factJob(page)).toHaveText('Uhrmacherin at Zahnradwerk Quellbach');
	// The row stays where it was for this visit rather than vanishing under the tap.
	await expect(row).toContainText('Uhrmacherin at Zahnradwerk Quellbach');

	// Kept — and from now on stated among the facts, so the row is gone.
	await page.reload();
	await expect(factJob(page)).toHaveText('Uhrmacherin at Zahnradwerk Quellbach');
	await expect(row).toHaveCount(0);

	// Escape puts the fact back unchanged.
	const factEditor = page.getByTestId('identity-facts').getByTestId('job-editor');
	await factJobButton(page).click();
	await factEditor.getByLabel('Job title').fill('Something else');
	await page.keyboard.press('Escape');
	await expect(factJobButton(page)).toBeFocused();
	await expect(factEditor).toHaveCount(0);
	await expect(factJob(page)).toHaveText('Uhrmacherin at Zahnradwerk Quellbach');

	// So does Cancel.
	await factJobButton(page).click();
	await factEditor.getByLabel('Company / organisation').fill('Elsewhere');
	await factEditor.getByRole('button', { name: 'Cancel' }).click();
	await expect(factJobButton(page)).toBeVisible();
	await expect(factEditor).toHaveCount(0);
	await expect(factJob(page)).toHaveText('Uhrmacherin at Zahnradwerk Quellbach');
});

test('edits the job among the facts, and clearing both leaves only the row behind the quiet button', async ({
	page
}) => {
	const person = 'Linus Quellbach';
	await seedPeople(page, [person], {
		[person]: { title: 'Glasbläser', company: 'Glashütte Quellbach' }
	});
	await openPerson(page, new RegExp(person));

	await expect(factJob(page)).toHaveText('Glasbläser at Glashütte Quellbach');
	// On record, so it is a fact and not one of the editable rows.
	await expect(page.locator('[data-row="job"]')).toHaveCount(0);
	const factEditor = page.getByTestId('identity-facts').getByTestId('job-editor');

	// It opens in place among the facts.
	await factJobButton(page).click();
	await expect(factEditor).toBeVisible();

	// An emptied company leaves the job title alone.
	await expect(factEditor.getByLabel('Job title')).toHaveValue('Glasbläser');
	await factEditor.getByLabel('Company / organisation').fill('');
	await factEditor.getByRole('button', { name: 'Save' }).click();
	await expect(factJob(page)).toHaveText('Glasbläser');

	// Both emptied: off the record, no fact left to tap, and the row back behind the button.
	await factJobButton(page).click();
	await factEditor.getByLabel('Job title').fill('');
	await factEditor.getByLabel('Company / organisation').fill('');
	await page.keyboard.press('Enter');
	await expect(factJob(page)).toHaveCount(0);
	const row = await identityRow(page, page.locator('[data-row="job"]'));
	await expect(row).toContainText('Not on record');
});

test('the People list finds someone by their company, shows the job, and tags only a job hit', async ({
	page
}) => {
	const person = 'Ronja Quellbach';
	await seedPeople(page, [person], {
		[person]: { title: 'Mechanikerin', company: 'Seilbahn Tobelegg' }
	});
	await openPeople(page);

	const finder = page.getByPlaceholder('Find someone…');
	const ronja = page.getByRole('link', { name: new RegExp(person) });

	await finder.fill('tobelegg');
	await expect(ronja).toBeVisible();
	await expect(ronja.getByTestId('job-line')).toHaveText('Mechanikerin at Seilbahn Tobelegg');
	await expect(ronja.getByTestId('found-by-job')).toHaveText('Job');

	// Found by her name, the job line is still there and needs no explaining.
	await finder.fill('Ronja Quell');
	await expect(ronja.getByTestId('job-line')).toHaveText('Mechanikerin at Seilbahn Tobelegg');
	await expect(ronja.getByTestId('found-by-job')).toHaveCount(0);
});

test('global search finds someone by their job title', async ({ page }) => {
	const person = 'Fabio Quellbach';
	await seedPeople(page, [person], {
		[person]: { title: 'Orgelbauer', company: 'Pfeifenwerk Tobelegg' }
	});

	await page.goto('/search?q=orgelbauer');
	const hit = page.locator('main').getByRole('link', { name: new RegExp(person) });
	await expect(hit).toBeVisible();
	await expect(hit.getByTestId('job-line')).toHaveText('Orgelbauer at Pfeifenwerk Tobelegg');
	await expect(hit.getByTestId('found-by-job')).toHaveText('Job');
});

test('the person picker finds someone by their job', async ({ page }) => {
	const person = 'Selma Quellbach';
	await seedPeople(page, [person], { [person]: { title: 'Hufschmiedin' } });
	await openPerson(page, /Lena Brunner/);
	await page.getByRole('button', { name: 'Log contact' }).first().click();

	const form = page.locator('form[action="?/logInteraction"]');
	const field = form.getByLabel('Who else was there?');
	await field.click();
	await field.fill('hufschmied');
	const option = page
		.getByTestId('person-search-listbox')
		.getByRole('option', { name: new RegExp(person) });
	await expect(option).toBeVisible();
	await expect(option.getByTestId('job-line')).toHaveText('Hufschmiedin');
	await expect(option.getByTestId('found-by-job')).toHaveText('Job');

	// And picking from it works like any other hit.
	await pickPerson(field, person);
	await expect(form.getByText(person)).toBeVisible();
});

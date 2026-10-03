import { expect, test, type Page } from '@playwright/test';
import { openPeople, openPerson, pickPerson, signIn } from './app';
import { seedHousehold } from './seed';

/*
 * A person's job title and company (docs/02 §2.2, §2.9): edited where they are read — the
 * profile card's *Job* row and the line under the name — and found by in the People list, the
 * search and the person picker, with a *Job* tag when only the job explains the hit. Written
 * after the owner tried it on the phone (docs/08 §8.4.1).
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

/** The line under the name in the header, which is the button that opens its editor. */
const headerJob = (page: Page) => page.getByTestId('person-job');
const headerJobButton = (page: Page) => page.getByRole('button').filter({ has: headerJob(page) });

test('sets job and company from the profile card, and Escape or Cancel keeps them as they were', async ({ page }) => {
	const person = 'Mirja Quellbach';
	await seedPeople(page, [person]);
	await openPerson(page, new RegExp(person));

	const row = page.locator('[data-row="job"]');
	await expect(row).toContainText('Not on record');
	// The row is on the page, so the header has rendered: it shows no job line.
	await expect(headerJob(page)).toHaveCount(0);

	await row.getByRole('button', { name: /^Job/ }).click();
	const editor = row.getByTestId('job-editor');
	await editor.getByLabel('Job title').fill('Uhrmacherin');
	await editor.getByLabel('Company / organisation').fill('Zahnradwerk Quellbach');
	await editor.getByRole('button', { name: 'Save' }).click();

	await expect(page.getByTestId('toast-notice')).toContainText('Saved');
	await expect(row).toContainText('Uhrmacherin at Zahnradwerk Quellbach');
	await expect(headerJob(page)).toHaveText('Uhrmacherin at Zahnradwerk Quellbach');

	// Kept.
	await page.reload();
	await expect(row).toContainText('Uhrmacherin at Zahnradwerk Quellbach');

	// Escape puts the row back unchanged.
	await row.getByRole('button', { name: /^Job/ }).click();
	await editor.getByLabel('Job title').fill('Something else');
	await page.keyboard.press('Escape');
	await expect(row.getByRole('button', { name: /^Job/ })).toBeVisible();
	await expect(row.getByRole('button', { name: /^Job/ })).toBeFocused();
	await expect(editor).toHaveCount(0);
	await expect(row).toContainText('Uhrmacherin at Zahnradwerk Quellbach');

	// So does Cancel.
	await row.getByRole('button', { name: /^Job/ }).click();
	await editor.getByLabel('Company / organisation').fill('Elsewhere');
	await editor.getByRole('button', { name: 'Cancel' }).click();
	await expect(row.getByRole('button', { name: /^Job/ })).toBeVisible();
	await expect(editor).toHaveCount(0);
	await expect(row).toContainText('Uhrmacherin at Zahnradwerk Quellbach');
});

test('edits the job from the line under the name, and clearing both leaves only the profile row', async ({ page }) => {
	const person = 'Linus Quellbach';
	await seedPeople(page, [person], { [person]: { title: 'Glasbläser', company: 'Glashütte Quellbach' } });
	await openPerson(page, new RegExp(person));

	await expect(headerJob(page)).toHaveText('Glasbläser at Glashütte Quellbach');
	const row = page.locator('[data-row="job"]');
	const headerEditor = page.locator('header').getByTestId('job-editor');

	// Escape closes the header's editor, unchanged, and hands focus back to the line.
	await headerJobButton(page).click();
	await headerEditor.getByLabel('Job title').fill('Something else');
	await page.keyboard.press('Escape');
	await expect(headerJobButton(page)).toBeFocused();
	await expect(headerEditor).toHaveCount(0);
	await expect(headerJob(page)).toHaveText('Glasbläser at Glashütte Quellbach');

	// It opens in the header itself, not on the profile card.
	await headerJobButton(page).click();
	await expect(headerEditor).toBeVisible();
	await expect(row.getByRole('button', { name: /^Job/ })).toBeVisible();
	await expect(row.getByTestId('job-editor')).toHaveCount(0);

	// An emptied company leaves the job title alone.
	await expect(headerEditor.getByLabel('Job title')).toHaveValue('Glasbläser');
	await headerEditor.getByLabel('Company / organisation').fill('');
	await headerEditor.getByRole('button', { name: 'Save' }).click();
	await expect(headerJob(page)).toHaveText('Glasbläser');
	await expect(row).toContainText('Glasbläser');
	await expect(row).not.toContainText('Glashütte');

	// Both emptied: off the record, and the header has no line left to tap.
	await headerJobButton(page).click();
	await headerEditor.getByLabel('Job title').fill('');
	await headerEditor.getByLabel('Company / organisation').fill('');
	await page.keyboard.press('Enter');
	await expect(row).toContainText('Not on record');
	await expect(headerJob(page)).toHaveCount(0);
});

test('the People list finds someone by their company, shows the job, and tags only a job hit', async ({ page }) => {
	const person = 'Ronja Quellbach';
	await seedPeople(page, [person], { [person]: { title: 'Mechanikerin', company: 'Seilbahn Tobelegg' } });
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
	await seedPeople(page, [person], { [person]: { title: 'Orgelbauer', company: 'Pfeifenwerk Tobelegg' } });

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
	const option = page.getByTestId('person-search-listbox').getByRole('option', { name: new RegExp(person) });
	await expect(option).toBeVisible();
	await expect(option.getByTestId('job-line')).toHaveText('Hufschmiedin');
	await expect(option.getByTestId('found-by-job')).toHaveText('Job');

	// And picking from it works like any other hit.
	await pickPerson(field, person);
	await expect(form.getByText(person)).toBeVisible();
});

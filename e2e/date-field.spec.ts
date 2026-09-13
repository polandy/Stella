import { expect, test, type Locator, type Page } from '@playwright/test';
import { signIn } from './app';

/*
 * Entering a date in the language Stella is read in (docs/05 §5.7, docs/02 §2.13.1). Written
 * after the field was seen in the running app (docs/08 §8.4.1).
 *
 * The browser these cases run in is en-US, which writes the month first. That is the whole
 * point: every assertion below would also hold if the field simply followed the browser —
 * except the ones that say it does not.
 *
 * The suite shares one database and asserts English elsewhere, so the German case hands the
 * account back in English afterwards, the way `language.spec.ts` does. Names are absent from
 * the demo seed and from every other spec.
 */

/** The three segments of a date field, in the order they are written on screen. */
function segments(group: Locator): Locator {
	return group.locator('input:not([type=hidden]), select');
}

/** Opens the quick-add page with its optional details showing. */
async function openQuickAdd(page: Page, more: string): Promise<void> {
	await page.goto('/contacts/new');
	await page.getByText(more).click();
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('writes the day first, where the browser would have written the month', async ({ page }) => {
	await openQuickAdd(page, 'More — nickname, birthday');
	const birthday = page.getByRole('group', { name: 'Birthday' });

	// en-GB, the app's English: day, month, year. The browser is en-US and would say month
	// first, so this ordering can only have come from the app's own locale.
	const labels = await segments(birthday).evaluateAll((els) =>
		els.map((el) => el.getAttribute('aria-label'))
	);
	expect(labels).toEqual(['Day', 'Month', 'Year']);
});

test.describe('read in German', () => {
	// The rest of the suite asserts English, and the choice lives in the shared profile, so
	// this hands the account back the way it found it — as `language.spec.ts` does.
	test.afterEach(async ({ page }) => {
		await page.goto('/settings');
		await page.getByRole('button', { name: 'English' }).click();
		await expect(page.getByRole('heading', { name: /^Settings$/ })).toBeVisible();
	});

	test('names the months in the language Stella is being read in', async ({ page }) => {
		await page.goto('/settings');
		await page.getByRole('button', { name: 'Deutsch' }).click();
		await expect(page.getByRole('heading', { name: /^Einstellungen$/ })).toBeVisible();

		await openQuickAdd(page, 'Mehr — Spitzname, Geburtstag');
		const birthday = page.getByRole('group', { name: 'Geburtstag' });

		const labels = await segments(birthday).evaluateAll((els) =>
			els.map((el) => el.getAttribute('aria-label'))
		);
		expect(labels).toEqual(['Tag', 'Monat', 'Jahr']);
		// The month is a named choice, and the names are German — not the browser's English.
		await expect(birthday.getByLabel('Monat', { exact: true }).getByRole('option')).toContainText(
			['Monat…', 'Januar']
		);
	});
});

test('keeps a birthday whose year nobody knows, and never invents one', async ({ page }) => {
	await openQuickAdd(page, 'More — nickname, birthday');
	await page.getByLabel('First name').fill('Miro');
	await page.getByLabel('Last name').fill('Stalder-Amrein');

	const birthday = page.getByRole('group', { name: 'Birthday' });
	await birthday.getByLabel('Day', { exact: true }).fill('29');
	await birthday.getByLabel('Month', { exact: true }).selectOption('2');
	// 29 February with no year: a real day in some years, which is exactly why the year may
	// be left out rather than guessed.

	await page.getByRole('button', { name: 'Add person' }).click();
	await expect(page.getByRole('heading', { name: 'Miro Stalder-Amrein' })).toBeVisible();
	await expect(page.getByText('29 February', { exact: false })).toBeVisible();
	// The positive control: a year would have been shown had one been given.
	await expect(page.getByText(/29 February \d{4}/)).toHaveCount(0);
});

test('refuses a day the calendar does not have, and will not submit it', async ({ page }) => {
	await openQuickAdd(page, 'More — nickname, birthday');
	await page.getByLabel('First name').fill('Annigna');
	await page.getByLabel('Last name').fill('Caviezel');

	const birthday = page.getByRole('group', { name: 'Birthday' });
	await birthday.getByLabel('Day', { exact: true }).fill('30');
	await birthday.getByLabel('Month', { exact: true }).selectOption('2');
	await birthday.getByLabel('Year', { exact: true }).fill('1987');

	await expect(page.getByText('There is no such day in the calendar.')).toBeVisible();
	await page.getByRole('button', { name: 'Add person' }).click();
	// The form did not go through: still on the quick-add page, nobody created.
	await expect(page.getByRole('heading', { name: 'Add a person' })).toBeVisible();
	await page.goto('/contacts');
	await expect(page.getByRole('link', { name: 'Annigna Caviezel' })).toHaveCount(0);
});

test('refuses a half-filled date rather than quietly storing nothing', async ({ page }) => {
	await openQuickAdd(page, 'More — nickname, birthday');
	const birthday = page.getByRole('group', { name: 'Birthday' });

	await birthday.getByLabel('Day', { exact: true }).fill('24');
	await birthday.getByLabel('Month', { exact: true }).selectOption('12');
	// The year is left blank on a field that allows exactly that…
	await expect(page.getByText('Fill in the whole date, or clear it.')).toHaveCount(0);

	// …but a day with no month is not a date in any reading of it.
	await birthday.getByLabel('Month', { exact: true }).selectOption('');
	await expect(page.getByText('Fill in the whole date, or clear it.')).toBeVisible();
	await expect(page.locator('input[name=birthDate]')).toHaveValue('');
});

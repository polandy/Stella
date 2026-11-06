import { expect, test, type Page } from '@playwright/test';
import { isoDaysAfter, serverToday, signIn } from './app';

/*
 * The first half of review 2026-11's UX polish (UX-02, UX-09, UX-11, UX-18, UX-24): back
 * links, the On this day picker, a new circle's focus, Settings' Household section and an age
 * that keeps to its line. Written after the owner's hand test (docs/08 §8.4.1). Nothing is
 * saved; the pure parts (`breadcrumbs`, `dayHeading`, `installRouteFor`) have their unit tests.
 */

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

const section = (page: Page, heading: string) =>
	page.locator('section', { has: page.getByRole('heading', { name: heading, exact: true }) });

test('On this day visits a day picked in its date field', async ({ page }) => {
	// Counted from the server's day, so only one clock is in play (docs/08 §8.4.2).
	const day = isoDaysAfter(await serverToday(page), -400);
	const [year, month, date] = day.split('-');

	// No button: each committed segment of a complete date takes the reader there by itself
	// (UX-11). The year goes first, so every step on the way is a day up to today.
	const field = page.getByTestId('memory-day-picker').getByRole('group', { name: 'Day' });
	await field.getByLabel('Year', { exact: true }).fill(year);
	await field.getByLabel('Year', { exact: true }).press('Tab');
	await expect(page).toHaveURL(new RegExp(`/on-this-day\\?day=${year}-`));
	await field.getByLabel('Month', { exact: true }).selectOption(String(Number(month)));
	await expect(page).toHaveURL(new RegExp(`/on-this-day\\?day=${year}-${month}-`));
	await field.getByLabel('Day', { exact: true }).fill(String(Number(date)));
	await field.getByLabel('Day', { exact: true }).press('Tab');

	await expect(page).toHaveURL(new RegExp(`/on-this-day\\?day=${day}$`));
});

test('Settings lists Relationship types under Household, not among the data tools', async ({
	page
}) => {
	await page.goto('/settings');
	await expect(
		section(page, 'Household').getByRole('link', { name: /Relationship types/ })
	).toHaveCount(1);
	await expect(section(page, 'Data').getByRole('link', { name: /Relationship types/ })).toHaveCount(
		0
	);
});

test('New circle hands the cursor to Name', async ({ page }) => {
	await page.goto('/circles');
	await page.getByRole('button', { name: 'New circle' }).click();
	await expect(page.getByRole('textbox', { name: 'Name' })).toBeFocused();
});

test.describe('on a phone', () => {
	test.use({ viewport: { width: 412, height: 915 } });

	test('a Settings page leads back to Settings once, and Gift ideas back to Home', async ({
		page
	}) => {
		await page.goto('/settings/calendar');
		const back = page.getByTestId('back-crumb');
		await expect(back).toHaveText('Settings');
		await expect(back).toHaveAttribute('href', '/settings');
		// The page's own link back is gone; the top bar's is the one way (UX-09).
		await expect(page.locator('main').getByRole('link', { name: 'Settings' })).toHaveCount(0);

		await page.goto('/gifts');
		await expect(back).toHaveText('Home');
		await expect(back).toHaveAttribute('href', '/');
	});

	test('a birthday’s age keeps to one line in the narrow facts column', async ({ page }) => {
		await page.goto('/contacts/demo-c-markus');
		const age = page
			.getByTestId('identity-facts')
			.locator('dd span', { hasText: /^· \d+ years?$/ })
			.first();
		await expect(age).toBeVisible();
		// One box: the "·" and the years never split across a line break (UX-02).
		expect(await age.evaluate((span) => span.getClientRects().length)).toBe(1);
	});
});

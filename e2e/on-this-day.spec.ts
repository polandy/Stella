import { expect, test, type Page } from '@playwright/test';
import { mentionNew, signIn } from './app';

/*
 * *On this day* (docs/02 §2.12.1): a moment written on today's date in an earlier year comes
 * back in Home's band, and opens its entry. Written after the owner verified the band and the
 * page in the running app (docs/08 §8.4.1).
 *
 * Ottilie is invented here and absent from the demo dataset. The day is the app's own — the
 * page's picker stops at the server's today — so the spec never reads the runner's clock.
 */

const MOMENT = 'rowed across the Lauerzersee';

/** The server's today, `YYYY-MM-DD`: the day picker on `/on-this-day` cannot go past it. */
async function serverToday(page: Page): Promise<string> {
	await page.goto('/on-this-day');
	const today = await page.getByLabel('Day', { exact: true }).getAttribute('max');
	expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	return today!;
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('brings back a moment from two years ago today in Home’s band, and opens it', async ({
	page
}) => {
	const today = await serverToday(page);
	// 29 February has no twin two years back; four years back it does.
	const yearsAgo = today.endsWith('-02-29') ? 4 : 2;
	const year = Number(today.slice(0, 4)) - yearsAgo;
	const day = Number(today.slice(8, 10));

	await page.goto('/');
	await page.getByLabel('What happened?').pressSequentially('With ');
	await mentionNew(page, 'Ottilie');
	await page.getByLabel('What happened?').pressSequentially(MOMENT);
	await page.getByRole('button', { name: /^Day:/ }).click();
	await page.getByRole('menuitem', { name: 'Another day…' }).click();
	const calendar = page.getByRole('group', { name: 'Choose a day' });
	await calendar.getByLabel('Year').selectOption(String(year));
	await calendar.getByRole('button', { name: new RegExp(`\\b${day} \\w+ ${year}$`) }).click();
	await page.getByRole('button', { name: /^Save/ }).click();
	await expect(page.locator('article', { hasText: MOMENT })).toBeVisible();

	await page.reload();
	const band = page.getByTestId('memory-band');
	await expect(
		band.getByRole('heading', { name: new RegExp(`^${yearsAgo} years ago\\W+${year}$`) })
	).toBeVisible();
	const row = band.getByTestId('memory-row').filter({ hasText: MOMENT });
	await expect(row).toContainText('Ottilie');

	await row.click();
	await page.waitForURL(/\/contacts\/[^/]+\/journal#/);
	await expect(page.getByText(MOMENT)).toBeVisible();
});

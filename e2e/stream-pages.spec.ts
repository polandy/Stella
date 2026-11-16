import { expect, test, type Page } from '@playwright/test';
import { signIn } from './app';

/*
 * Home's stream loads its older pages as the reader scrolls (docs/dev/02 §2.22.2). The demo
 * dataset alone holds more than one page of 40 rows.
 */

const PAGE_SIZE = 40;

/** How far the shell's scroller stands; the document itself never scrolls. */
const contentTop = (page: Page) =>
	page.locator('#content').evaluate((content) => content.scrollTop);

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('loads the next page when the foot of the stream comes into view', async ({ page }) => {
	const rows = page.getByTestId('stream').locator('article');
	await expect(rows).toHaveCount(PAGE_SIZE);

	await page.getByTestId('stream-foot').scrollIntoViewIfNeeded();

	await expect(page).toHaveURL(/[?&]pages=2\b/);
	await expect.poll(() => rows.count()).toBeGreaterThan(PAGE_SIZE);
});

test('Show older loads the next page by keyboard', async ({ page }) => {
	const more = page.getByRole('link', { name: 'Show older' });
	await more.focus();
	await page.keyboard.press('Enter');

	await expect(page).toHaveURL(/[?&]pages=2\b/);
	await expect
		.poll(() => page.getByTestId('stream').locator('article').count())
		.toBeGreaterThan(PAGE_SIZE);
});

test('back from a row on the second page returns to the same rows and place', async ({ page }) => {
	await page.goto('/?pages=2');
	// A row past the first page that links a person, whatever other specs have added above it.
	const personLink = page.locator('a[href^="/contacts/"]');
	const row = page
		.getByTestId('stream')
		.locator('article')
		.filter({ has: personLink })
		.nth(PAGE_SIZE);
	const link = row.locator(personLink).first();
	await link.scrollIntoViewIfNeeded();
	const scrolled = await contentTop(page);
	expect(scrolled).toBeGreaterThan(0);
	const address = page.url();

	await link.click();
	await expect(page).not.toHaveURL(/pages=/);
	await page.goBack();

	await expect(page).toHaveURL(address);
	await expect(row).toBeVisible();
	await expect.poll(() => contentTop(page)).toBe(scrolled);
});

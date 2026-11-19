import { expect, test, type Page } from '@playwright/test';
import { signIn } from './app';

/*
 * Albums in the Immich photo picker (docs/dev/02 §2.24.9): the Albums tab under the search, the
 * album list with its name filter and a cover placeholder, an album's photos, ticks that survive
 * the switch between the tabs, and each tab keeping its level.
 *
 * The e2e server runs with `IMMICH_DEMO=true`: the in-memory demo library holds thirteen albums
 * with photos, so the filter shows; *Garten* holds the newest photos and comes first, *Umzug*
 * names a cover that is no timeline photo. Nothing is added, so no other spec is touched.
 */

const sheet = (page: Page) => page.getByTestId('immich-library');
const albums = (page: Page) => sheet(page).getByTestId('immich-library-albums').getByRole('button');
const trail = (page: Page) => sheet(page).getByTestId('immich-library-trail');
const tab = (page: Page, name: 'Time' | 'Albums') =>
	sheet(page).getByTestId('immich-library-tabs').getByRole('tab', { name });
const photos = (page: Page) =>
	sheet(page)
		.getByTestId('immich-library-month')
		.getByRole('button', { name: /^Photo/ });

async function openPicker(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Add photos' }).click();
	await page.getByRole('menuitem', { name: 'From Immich' }).click();
	await expect(sheet(page)).toBeVisible();
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('the Albums tab lists the albums, latest first, filters them by name and keeps ticks', async ({
	page
}) => {
	await openPicker(page);
	await expect(tab(page, 'Time')).toHaveAttribute('aria-selected', 'true');
	await tab(page, 'Albums').click();
	await expect(trail(page)).toContainText('All albums');

	await expect(albums(page)).toHaveCount(13);
	await expect(albums(page).first()).toContainText('Garten');
	await expect(albums(page).first()).toContainText('about 150');
	const move = albums(page).filter({ hasText: 'Umzug' });
	await expect(move.getByTestId('immich-album-no-cover')).toBeVisible();
	await expect(albums(page).filter({ hasText: 'Leer' })).toHaveCount(0);

	// Every word, case and accents ignored.
	const filter = sheet(page).getByTestId('immich-album-filter');
	await filter.fill('zurich');
	await expect(albums(page)).toHaveText([/Zoo Zürich/]);
	await filter.fill('nichts');
	await expect(sheet(page)).toContainText('No album is called “nichts”');
	await filter.fill('sommer engadin');
	await albums(page).first().click();

	await expect(trail(page)).toContainText('All albums');
	await expect(trail(page)).toContainText('Sommerferien Engadin');
	await expect(photos(page)).toHaveCount(24);
	// Oldest first, and the headings name the year: an album can span several.
	await expect(sheet(page).getByTestId('immich-library-month').locator('h3').first()).toHaveText(
		'Thursday, 30 July 2026'
	);
	await photos(page).nth(0).click();
	await photos(page).nth(1).click();
	await expect(sheet(page)).toContainText('2 ticked');

	// The Time tab is where it was; back in Albums the album is still open, ticks and all.
	await tab(page, 'Time').click();
	await expect(sheet(page).getByTestId('immich-library-day')).toBeVisible();
	await expect(sheet(page)).toContainText('2 ticked');
	await tab(page, 'Albums').click();
	await expect(trail(page)).toContainText('Sommerferien Engadin');
	await expect(photos(page).nth(0)).toHaveAttribute('aria-pressed', 'true');

	// Back in the list the filter is as it was left.
	await trail(page).getByRole('button', { name: 'All albums' }).click();
	await expect(filter).toHaveValue('sommer engadin');
	await expect(albums(page)).toHaveText([/Sommerferien Engadin/]);
	await filter.fill('');
	await expect(albums(page)).toHaveCount(13);
	await expect(sheet(page).getByTestId('immich-library-tray').getByRole('button')).toHaveCount(2);
});

test('an album longer than a page reads on, and a day heading opens that day under Time', async ({
	page
}) => {
	await openPicker(page);
	await tab(page, 'Albums').click();
	await albums(page).filter({ hasText: 'Garten' }).click();
	// The first page is 100; reaching its end reads the rest.
	await expect(photos(page).nth(99)).toBeVisible();
	await photos(page).nth(99).scrollIntoViewIfNeeded();
	await expect(photos(page)).toHaveCount(150);

	await sheet(page)
		.getByTestId('immich-library-month')
		.locator('section')
		.first()
		.getByRole('button')
		.first()
		.click();
	await expect(tab(page, 'Time')).toHaveAttribute('aria-selected', 'true');
	await expect(sheet(page).getByTestId('immich-library-day')).toBeVisible();
});

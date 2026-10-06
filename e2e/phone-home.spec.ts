import { expect, test, type Page } from '@playwright/test';
import { signIn } from './app';

/*
 * A quieter phone Home (docs/05 §5.4, §5.5; docs/02 §2.22.2): *Add person* is a secondary icon
 * button, the top bar has no search button on Home (the page's own field is the search), and the
 * stream's What/Who chip rows fold into one *Filter* pill opening a sheet. The desktop keeps the
 * rows and the labelled button. Written after the maintainer tried it on the phone (#255,
 * docs/08 §8.4.1). What the pill says is `filter-pill.test.ts`'s; this asks what the screen does.
 *
 * The demo household has two members: the admin this suite signs in as ("You") and Nina Brunner.
 * Only the URL's filter changes here; nothing is written.
 */

const PIXEL_9_PRO = { width: 412, height: 915 };
const NINA = 'Nina Brunner';

const topBar = (page: Page) => page.getByTestId('top-bar');
const addPerson = (page: Page) => page.getByRole('banner').getByRole('link', { name: 'Add person' });
const searchButton = (page: Page) => topBar(page).getByRole('button', { name: 'Search' });
const pill = (page: Page) => page.getByRole('button', { name: /^Filter the stream/ });
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Filter the stream' });
const sheetChip = (page: Page, name: string) => sheet(page).getByRole('link', { name, exact: true });
const pillSummary = (page: Page) => page.getByTestId('stream-filter-pill').locator('span.truncate');
const chipRows = (page: Page) => page.getByRole('navigation', { name: 'Filter the stream' });
const streamItems = (page: Page) => page.getByTestId('stream').locator('article');

/** Opens the sheet from the pill; the pill is a native popover button, so it answers before hydration too. */
async function openSheet(page: Page): Promise<void> {
	await pill(page).click();
	await expect(sheet(page)).toBeVisible();
}

test.describe('on a phone', () => {
	test.use({ viewport: PIXEL_9_PRO, hasTouch: true });

	test('keeps Add person as an icon in the top bar and leaves search to the page on Home', async ({ page }) => {
		await signIn(page);

		// The icon carries the name; the word itself is for wider screens.
		await expect(addPerson(page)).toBeVisible();
		await expect(addPerson(page).getByText('Add person')).toBeHidden();
		// The page's own field is the search on Home — and the hidden button is still there (the
		// shell has mounted, `signIn` waited for it), only not shown.
		await expect(page.getByRole('combobox', { name: 'Find a person…' })).toBeVisible();
		await expect(topBar(page).getByRole('button', { name: 'Search', includeHidden: true })).toBeEnabled();
		await expect(searchButton(page)).toBeHidden();

		await page.getByRole('link', { name: 'People' }).last().click();
		await expect(page.getByRole('heading', { name: 'People' })).toBeVisible();
		await expect(searchButton(page)).toBeVisible();
	});

	test('folds the chip rows into a Filter pill whose sheet narrows the stream', async ({ page }) => {
		await signIn(page);
		await expect(pill(page)).toHaveAccessibleName('Filter the stream');
		await expect(chipRows(page)).toBeHidden();
		await expect(sheet(page)).toBeHidden();

		await openSheet(page);
		await expect(sheetChip(page, 'Everything')).toHaveAttribute('aria-current', 'true');
		await expect(sheet(page).getByRole('link', { name: 'Show everything' })).toHaveCount(0);

		// A chip narrows the stream in place: the URL says so, the sheet stays open to pick more.
		await sheetChip(page, 'New people').click();
		await expect(page).toHaveURL(/[?&]kind=person/);
		await expect(sheetChip(page, 'New people')).toHaveAttribute('aria-current', 'true');
		await expect(sheet(page)).toBeVisible();
		await expect(sheet(page).getByRole('link', { name: 'Show everything' })).toBeVisible();
		await expect(streamItems(page).first()).toBeVisible();
		await expect(streamItems(page).filter({ hasNotText: 'New person' })).toHaveCount(0);

		await sheet(page).getByRole('button', { name: 'Done' }).click();
		await expect(sheet(page)).toBeHidden();
		await expect(pill(page)).toHaveAccessibleName('Filter the stream, 1 active');
		await expect(pill(page)).toHaveClass(/bg-primary-soft/);
		await expect(pillSummary(page)).toHaveText('New people');

		// A member on top of the kind: two axes narrowed.
		await openSheet(page);
		await sheetChip(page, NINA).click();
		await expect(page).toHaveURL(/kind=person.*by=|by=.*kind=person/);
		await expect(sheetChip(page, NINA)).toHaveAttribute('aria-current', 'true');
		await sheet(page).getByRole('button', { name: 'Done' }).click();
		await expect(pill(page)).toHaveAccessibleName('Filter the stream, 2 active');
		await expect(pillSummary(page)).toHaveText(`New people · ${NINA}`);

		// The filter lives in the URL, so a reload keeps it.
		await page.reload();
		await expect(pill(page)).toHaveAccessibleName('Filter the stream, 2 active');
		await expect(pillSummary(page)).toHaveText(`New people · ${NINA}`);

		// Show everything takes both off, in the URL and on the pill.
		await openSheet(page);
		await sheet(page).getByRole('link', { name: 'Show everything' }).click();
		await expect(page).toHaveURL((url) => url.pathname === '/' && url.search === '');
		await expect(sheetChip(page, 'Everything')).toHaveAttribute('aria-current', 'true');
		await expect(pill(page)).toHaveAccessibleName('Filter the stream');
		await expect(pill(page)).not.toHaveClass(/bg-primary-soft/);
		await expect(pillSummary(page)).toHaveCount(0);
	});

	test.describe('without JavaScript', () => {
		test.use({ javaScriptEnabled: false });

		test('opens the sheet, narrows the stream and closes it again', async ({ page }) => {
			// No shell to wait for: the page is read as the server sent it.
			await page.goto('/');
			if (new URL(page.url()).pathname === '/login') {
				await page.getByRole('button', { name: 'Sign in as demo user' }).click();
			}
			await expect(pill(page)).toHaveAccessibleName('Filter the stream');

			await openSheet(page);
			await sheetChip(page, 'Moments').click();
			// A full page load this time, so the sheet comes back closed with the pill narrowed.
			await expect(page).toHaveURL(/[?&]kind=moment/);
			await expect(pill(page)).toHaveAccessibleName('Filter the stream, 1 active');
			await expect(pillSummary(page)).toHaveText('Moments');

			await openSheet(page);
			await expect(sheetChip(page, 'Moments')).toHaveAttribute('aria-current', 'true');
			await sheet(page).getByRole('button', { name: 'Done' }).click();
			await expect(sheet(page)).toBeHidden();
			await expect(pill(page)).toBeVisible();
		});
	});
});

test('keeps the chip rows and a labelled Add person on a desktop', async ({ page }) => {
	await signIn(page);

	await expect(chipRows(page)).toBeVisible();
	await expect(chipRows(page).getByRole('link', { name: 'Everything', exact: true })).toHaveAttribute(
		'aria-current',
		'true'
	);
	await expect(pill(page)).toBeHidden();
	await expect(addPerson(page).getByText('Add person')).toBeVisible();
	await expect(searchButton(page)).toBeVisible();
});

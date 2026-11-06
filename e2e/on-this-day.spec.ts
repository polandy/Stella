import { expect, test } from '@playwright/test';
import { mentionNew, serverToday, signIn } from './app';

/*
 * *On this day* (docs/02 §2.12.1): a moment written on today's date in an earlier year comes
 * back in Home's band, and opens its entry. Written after the owner verified the band and the
 * page in the running app (docs/08 §8.4.1).
 *
 * Ottilie is invented here and absent from the demo dataset. The day is the app's own — the
 * page's picker stops at the server's today — so the spec never reads the runner's clock.
 *
 * Immich's photos of the day come from the e2e server's fake library (IMMICH_DEMO,
 * `src/lib/server/immich/demo-library.ts`): every face's n-th photo is taken n days before
 * 1 September 2026, so any day has some in earlier years. No year holds more than a page of them,
 * so *Show more* rests on the unit tests (`src/lib/memories/immich.test.ts`).
 */

/** Where *Open in Immich* leads for a photo of a face's own, as the fake names its assets. */
const IMMICH_PHOTO = /\/photos\/[0-9a-f]{8}-0000-4000-8000-[0-9a-f]{12}$/;

/**
 * A fixed day the fake can be counted on: 31 August 2025 is 366 days (`0x16e`) before its newest
 * photo, the 366th photo of the six faces with more; 2019 has Markus's alone; 2018 has none.
 */
const FIXED_DAY = '2026-08-31';
const PHOTO_OF_2025 = /\/photos\/0000016e-0000-4000-8000-[0-9a-f]{12}$/;

const MOMENT = 'rowed across the Lauerzersee';

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

test('adds Immich photos of the day to Home’s band, and walks them in a lightbox', async ({
	page
}) => {
	await page.goto('/');
	const band = page.getByTestId('memory-band');
	const tiles = band.getByTestId('memory-immich-photo');
	await expect(tiles.first()).toBeVisible();
	await expect(tiles.first().getByTestId('photo-immich-badge')).toHaveText('Immich');
	// Four tiles at most, the gallery's first; Immich fills what is left.
	const all = band.getByTestId('memory-photos').locator('> li');
	expect(await all.count()).toBeLessThanOrEqual(4);
	const count = await tiles.count();

	await tiles.first().getByRole('button').click();
	const lightbox = page.getByTestId('memory-lightbox');
	await expect(lightbox.getByTestId('memory-lightbox-position')).toHaveText(`1 of ${count}`);
	await expect(lightbox.getByTestId('memory-lightbox-date')).toContainText('15:30');
	await expect(lightbox.getByTestId('memory-lightbox-open')).toHaveAttribute('href', IMMICH_PHOTO);
	// Walking back from the first wraps round to the last.
	await lightbox.getByRole('button', { name: 'Previous photo' }).click();
	await expect(lightbox.getByTestId('memory-lightbox-position')).toHaveText(`${count} of ${count}`);
	await lightbox.getByRole('button', { name: 'Close' }).click();
	await expect(lightbox).toBeHidden();
	// Focus goes back to the photo the lightbox closed on.
	await expect(tiles.nth(count - 1).getByRole('button')).toBeFocused();
});

test('puts Immich photos into each year’s card, a year only Immich has among them', async ({
	page
}) => {
	await page.goto(`/on-this-day?day=${FIXED_DAY}`);
	const card = (year: number) =>
		page.locator('section').filter({ has: page.getByRole('heading', { name: `· ${year}` }) });

	const photos2025 = card(2025).getByTestId('memory-immich-photo');
	await expect(photos2025).toHaveCount(6);
	await expect(card(2025).getByTestId('memory-immich-more')).toHaveCount(0);
	await expect(card(2019).getByTestId('memory-immich-photo')).toHaveCount(1);
	await expect(card(2018).getByTestId('memory-immich-photo')).toHaveCount(0);
	await expect(page.getByTestId('memory-immich-loading')).toHaveCount(0);

	await photos2025.first().getByRole('button').click();
	const lightbox = page.getByTestId('memory-lightbox');
	await expect(lightbox.getByTestId('memory-lightbox-position')).toHaveText('1 of 6');
	await expect(lightbox.getByTestId('memory-lightbox-date')).toContainText('2025');
	await expect(lightbox.getByTestId('memory-lightbox-open')).toHaveAttribute('href', PHOTO_OF_2025);
	await lightbox.getByRole('button', { name: 'Next photo' }).click();
	await expect(lightbox.getByTestId('memory-lightbox-position')).toHaveText('2 of 6');
});

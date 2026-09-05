import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openPerson, signIn } from './app';

/*
 * The photo gallery on a person (docs/02 §2.14). Written after the maintainer verified the
 * flow in the app (docs/08 §8.4.1). Runs against the demo dataset as the demo admin, on a
 * person no other spec photographs, since the suite shares one database.
 */

/*
 * The suite shares one database and runs serially, so each case works on a person of its
 * own rather than assuming an empty gallery someone else has just filled.
 */
const PHOTOGRAPHED = /Corinne Keller/;
const UNPHOTOGRAPHED = /Beat Steiner/;
const PIXEL = readFileSync('e2e/fixtures/monica-photos/photos/ottilie-avatar.png');

const file = (name: string) => ({ name, mimeType: 'image/png', buffer: PIXEL });

/** Opens a person and their Photos tab. */
async function openPhotos(page: Page, person: RegExp): Promise<void> {
	await openPerson(page, person);
	await page.getByRole('tab', { name: /Photos/ }).click();
}

/** Uploads through the disclosure, choosing shared or private. */
async function addPhotos(
	page: Page,
	files: { name: string; mimeType: string; buffer: Buffer }[],
	visibility: 'shared' | 'private' = 'shared'
): Promise<void> {
	await page.getByRole('button', { name: 'Add photos' }).click();
	const form = page.locator('#panel-photos form');
	await form.locator('input[name=files]').setInputFiles(files);
	if (visibility === 'private') await form.getByText('Private', { exact: true }).click();
	await form.getByRole('button', { name: 'Add', exact: true }).click();
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('adds photos, captions one, and keeps the caption on the picture it belongs to', async ({ page }) => {
	await openPhotos(page, PHOTOGRAPHED);
	await expect(page.getByText('No photos yet.')).toBeVisible();

	await addPhotos(page, [file('lake.png'), file('boat.png')]);
	const grid = page.getByTestId('photo-grid');
	await expect(grid.locator('img')).toHaveCount(2);
	await expect(page.getByRole('tab', { name: /Photos/ })).toContainText('2');

	await grid.getByRole('button').first().click();
	const lightbox = page.getByTestId('photo-lightbox');
	await expect(lightbox).toContainText('No caption');
	await lightbox.getByLabel('Caption').fill('At the lake');
	await lightbox.getByRole('button', { name: 'Save' }).click();

	// The action comes back to the photos, not to the story; the caption is on the picture
	// it was written for, and only on that one.
	await grid.getByRole('button').first().click();
	await expect(page.getByTestId('photo-lightbox')).toContainText('At the lake');
	await page.getByTestId('photo-lightbox').getByRole('button', { name: 'Close', exact: true }).click();
	await grid.getByRole('button').nth(1).click();
	await expect(page.getByTestId('photo-lightbox')).toContainText('No caption');
});

test('marks a private photo in the grid and lets its owner share it', async ({ page }) => {
	await openPhotos(page, PHOTOGRAPHED);
	await addPhotos(page, [file('secret.png')], 'private');
	const grid = page.getByTestId('photo-grid');
	await expect(grid.getByTitle('Private — only you can see this')).toHaveCount(1);

	await grid.getByRole('button').first().click();
	const lightbox = page.getByTestId('photo-lightbox');
	await expect(lightbox).toContainText('private');
	await lightbox.getByRole('button', { name: 'Share with the household' }).click();
	await expect(grid.getByTitle('Private — only you can see this')).toHaveCount(0);
});

test('wears a gallery photo as the avatar, and gives it back when the photo is removed', async ({ page }) => {
	await openPhotos(page, UNPHOTOGRAPHED);
	await addPhotos(page, [file('portrait.png')]);
	const grid = page.getByTestId('photo-grid');
	// The hero avatar lives inside the uploader button, which is where a chosen photo shows up.
	const avatar = page.getByRole('button', { name: /Change photo|Add a photo/ }).locator('img');
	await expect(page.getByRole('tab', { name: /Photos/ })).toContainText('1');
	await expect(avatar).toHaveCount(0); // initials until a photo is chosen

	await grid.getByRole('button').first().click();
	await page.getByTestId('photo-lightbox').getByRole('button', { name: 'Use as photo' }).click();
	await expect(avatar).toHaveAttribute('src', /\/media\//);

	// Reopening shows the photo is the one being worn, so it cannot be chosen twice.
	await grid.getByRole('button').first().click();
	const lightbox = page.getByTestId('photo-lightbox');
	await expect(lightbox.getByRole('button', { name: 'Current photo' })).toBeDisabled();

	// Removing the photo takes the face with it rather than leaving a broken one.
	await lightbox.getByRole('button', { name: 'Remove' }).click();
	await expect(page.getByRole('tab', { name: /Photos/ })).toContainText('0');
	await expect(page.getByText('No photos yet.')).toBeVisible();
	await expect(avatar).toHaveCount(0);
});

import { expect, test, type Page } from '@playwright/test';
import { signIn } from './app';

/*
 * The second of Monica's own exports: the JSON file (docs/02 §2.16, docs/monica-mapping.md).
 * Written after a real export from the maintainer's Monica went through the wizard and was
 * checked in the app (docs/08 §8.4.1).
 *
 * What this file proves that `monica-import.spec.ts` cannot: the format is recognised from the
 * file itself with nothing to pick, the pictures travel *inside* the export instead of a folder,
 * and the loss the JSON format carries is stated rather than swallowed. Its people (the
 * Hauensteins) appear in no seed and in no other fixture, so the cases here and the dump's cases
 * can share one database.
 */

const EXPORT = 'e2e/fixtures/monica-mini.json';
const PHOTO_ID = 'monica:photo:9f0d5c2a-1111-4a5b-8c3d-0000000000p1';

// The second case reads what the first one wrote.
test.describe.configure({ mode: 'serial' });

/** Upload → preview: returns once the preview is on screen. */
async function previewExport(page: Page): Promise<void> {
	await page.goto('/settings/import');
	await page.locator('input[name=dump]').setInputFiles(EXPORT);
	await page.getByRole('button', { name: 'Preview' }).click();
	await expect(page.getByTestId('import-preview')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('imports a JSON export, stores the pictures it carries and shows the people', async ({ page }) => {
	await previewExport(page);
	const preview = page.getByTestId('import-preview');
	await expect(preview.locator('div', { hasText: /^contacts/ })).toContainText('2');
	await expect(preview.locator('div', { hasText: /^relationships/ })).toContainText('1');
	await expect(preview.locator('div', { hasText: /^tags/ })).toContainText('1');
	await expect(preview.locator('div', { hasText: /^photos/ })).toContainText('1');
	// What the JSON format cannot carry is said out loud, not silently dropped.
	await expect(page.getByText(/does not carry “how you met”/)).toBeVisible();

	await page.getByRole('button', { name: 'Import now' }).click();
	await expect(page.getByTestId('import-done')).toContainText('Imported 2 people, 1 relationship');

	// The pictures are in the file, so there is nothing to point at — and the button that
	// replaces the folder picker is the positive control for that absence.
	await expect(page.getByLabel('Monica photo folder')).toHaveCount(0);
	await page.getByRole('button', { name: 'Store photos' }).click();
	await expect(page.getByText('1 of 1 · 1 stored')).toBeVisible();
	await page.getByRole('button', { name: 'Finish' }).click();
	await expect(page).toHaveURL(/\/contacts$/);

	await page.getByRole('link', { name: /Severin Hauenstein/ }).first().click();
	await expect(page.getByRole('heading', { name: 'Severin Hauenstein' })).toBeVisible();
	// The birthday was nested inside the person in the JSON, where the dump had a side table.
	await expect(page.getByText('11 April 1979')).toBeVisible();
	// A tag is a bare name in the export; it became a tag of the household's own.
	await expect(page.locator('section', { has: page.getByText('Tags', { exact: true }) }).first()).toContainText('Jassrunde');
	// The link names its type in words only, and still found Stella's built-in type.
	await page.getByRole('tab', { name: /People/ }).click();
	await expect(page.getByRole('link', { name: 'Marlis Hauenstein', exact: true })).toBeVisible();
	await page.getByRole('tab', { name: /Notes/ }).click();
	await expect(page.getByText('Bringt an Silvester immer die Rösti mit.')).toBeVisible();
	// The embedded picture went through the browser's resize pipeline and became the avatar.
	await expect(page.locator('img[alt="Severin Hauenstein"]')).toHaveAttribute(
		'src',
		new RegExp(PHOTO_ID)
	);
});

test('a second run of the same export writes nothing twice', async ({ page }) => {
	await previewExport(page);
	await page.getByRole('button', { name: 'Import now' }).click();
	const done = page.getByTestId('import-done');
	await expect(done).toContainText('Imported 0 people');
	await expect(done).toContainText('Everything was already there, so nothing was written twice.');
	await page.getByRole('button', { name: 'Store photos' }).click();
	await expect(page.getByText('1 of 1 · 0 stored, 1 already there')).toBeVisible();
	await page.goto('/contacts');
	await expect(page.getByRole('link', { name: /Severin Hauenstein/ })).toHaveCount(1);
});

test('rejects JSON that is not a Monica export', async ({ page }) => {
	await page.goto('/settings/import');
	await page.locator('input[name=dump]').setInputFiles({
		name: 'shopping.json',
		mimeType: 'application/json',
		buffer: Buffer.from('{"items":["milk"]}')
	});
	await page.getByRole('button', { name: 'Preview' }).click();
	await expect(page.getByText('This file is not a Monica JSON export.')).toBeVisible();
});

test('says so when a file starts like JSON but is broken', async ({ page }) => {
	await page.goto('/settings/import');
	await page.locator('input[name=dump]').setInputFiles({
		name: 'truncated.json',
		mimeType: 'application/json',
		buffer: Buffer.from('{"version":"1.0-preview.1","account":{')
	});
	await page.getByRole('button', { name: 'Preview' }).click();
	await expect(page.getByText(/could not be read as JSON/)).toBeVisible();
});

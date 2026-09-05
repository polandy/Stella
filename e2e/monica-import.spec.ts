import { expect, test, type Page } from '@playwright/test';

/*
 * The Monica import wizard (docs/02 §2.16, docs/monica-mapping.md). Written after a real
 * 300-person dump was migrated through the wizard and checked in the app (docs/08 §8.4.1).
 * Runs against the demo dataset as the demo admin, with a hand-written mini dump whose
 * people (the Vogelsangs) no seeded data uses. Photos go through the same browser resize
 * pipeline as a real folder upload.
 */

const DUMP = 'e2e/fixtures/monica-mini.sql';
const PHOTO_FOLDER = 'e2e/fixtures/monica-photos';

/** Signs in through the SEED_DEMO one-click button and lands on Home. */
async function signIn(page: Page): Promise<void> {
	await page.goto('/login');
	await page.getByRole('button', { name: 'Sign in as demo user' }).click();
	await expect(page.getByRole('heading', { name: 'What happened?' })).toBeVisible();
}

/** Upload → preview: returns once the preview is on screen. */
async function previewDump(page: Page): Promise<void> {
	await page.goto('/settings/import');
	await page.locator('input[name=dump]').setInputFiles(DUMP);
	await page.getByRole('button', { name: 'Preview' }).click();
	await expect(page.getByTestId('import-preview')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('previews the dump, imports it, attaches the photos and shows the people in the app', async ({ page }) => {
	await previewDump(page);
	const preview = page.getByTestId('import-preview');
	await expect(preview.locator('div', { hasText: /^contacts/ })).toContainText('2');
	await expect(preview.locator('div', { hasText: /^relationships/ })).toContainText('1');
	await expect(preview.locator('div', { hasText: /^photos/ })).toContainText('1');
	// The deleted person is named as left out, with the reason.
	await expect(page.getByText('Left out, and why')).toBeVisible();
	await expect(page.getByText(/1 contact/)).toBeVisible();

	await page.getByRole('button', { name: 'Import now' }).click();
	await expect(page.getByTestId('import-done')).toContainText('Imported 2 people, 1 relationship');

	await page.getByLabel('Monica photo folder').setInputFiles(PHOTO_FOLDER);
	await expect(page.getByText('1 of 1 · 1 stored')).toBeVisible();
	await page.getByRole('button', { name: 'Finish' }).click();
	await expect(page).toHaveURL(/\/contacts$/);

	await page.getByRole('link', { name: /Ottilie Vogelsang/ }).first().click();
	await expect(page.getByRole('heading', { name: 'Ottilie Vogelsang' })).toBeVisible();
	// The age-based birthday became an estimate, never a birthday.
	await expect(page.getByText('around 2016')).toBeVisible();
	await expect(page.getByText('estimated')).toBeVisible();
	// The mirrored Monica rows became one relationship, listed under the People tab.
	await page.getByRole('tab', { name: /People/ }).click();
	await expect(page.getByRole('link', { name: 'Kaspar Vogelsang' })).toBeVisible();
	await page.getByRole('tab', { name: /Notes/ }).click();
	await expect(page.getByText('Prefers the harbour walk in Tallinn.')).toBeVisible();
	await expect(page.locator('img[alt="Ottilie Vogelsang"]')).toHaveAttribute('src', /monica:photo:1/);
});

test('a second run of the same dump writes nothing twice', async ({ page }) => {
	await previewDump(page);
	await page.getByRole('button', { name: 'Import now' }).click();
	const done = page.getByTestId('import-done');
	await expect(done).toContainText('Imported 0 people');
	await expect(done).toContainText('Everything was already there, so nothing was written twice.');
	await page.getByLabel('Monica photo folder').setInputFiles(PHOTO_FOLDER);
	await expect(page.getByText('1 of 1 · 0 stored, 1 already there')).toBeVisible();
	// Still exactly one Ottilie in the list.
	await page.goto('/contacts');
	await expect(page.getByRole('link', { name: /Ottilie Vogelsang/ })).toHaveCount(1);
});

test('rejects a file that is not a Monica dump', async ({ page }) => {
	await page.goto('/settings/import');
	await page.locator('input[name=dump]').setInputFiles({
		name: 'notes.sql',
		mimeType: 'application/sql',
		buffer: Buffer.from('CREATE TABLE `pets` (\n  `id` int(10) NOT NULL\n) ENGINE=InnoDB;\n')
	});
	await page.getByRole('button', { name: 'Preview' }).click();
	await expect(page.getByText(/has no contacts table/)).toBeVisible();
});

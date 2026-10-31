import { expect, test, type Page } from '@playwright/test';
import { factEditor, signIn } from './app';

/*
 * The Monica import wizard (docs/02 §2.16, docs/monica-mapping.md). Written after a real
 * 300-person dump was migrated through the wizard and checked in the app (docs/08 §8.4.1).
 * Runs against the demo dataset as the demo admin, with a hand-written mini dump whose
 * people (the Vogelsangs) no seeded data uses. Photos go through the same browser resize
 * pipeline as a real folder upload.
 */

const DUMP = 'e2e/fixtures/monica-mini.sql';
const PHOTO_FOLDER = 'e2e/fixtures/monica-photos';

/** An open to-do on the person's To do card. */
const todoRow = (page: Page, title: string) =>
	page.getByTestId('todos').locator('li', { hasText: title });

/** A done to-do in the person's Activity, under the day it was done. */
const doneOn = (page: Page, day: string, title: string) =>
	page
		.getByTestId('story-timeline')
		.locator(':scope > li', { has: page.getByRole('heading', { name: day, exact: true }) })
		.locator('[data-story-item]', { hasText: title });

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

test('previews the dump, imports it, attaches the photos and shows the people in the app', async ({
	page
}) => {
	await previewDump(page);
	const preview = page.getByTestId('import-preview');
	await expect(preview.locator('div', { hasText: /^contacts/ })).toContainText('2');
	await expect(preview.locator('div', { hasText: /^relationships/ })).toContainText('1');
	await expect(preview.locator('div', { hasText: /^photos/ })).toContainText('1');
	await expect(preview.locator('div', { hasText: /^to-dos/ })).toContainText('2');
	// The deleted person is named as left out, with the reason.
	await expect(page.getByText('Left out, and why')).toBeVisible();
	await expect(page.getByText(/1 contact/)).toBeVisible();
	// So are the task on that person and the one Monica kept on nobody.
	await expect(page.getByText('1 task — belongs to a deleted contact')).toBeVisible();
	await expect(page.getByText('1 task — attached to no person')).toBeVisible();

	await page.getByRole('button', { name: 'Import now' }).click();
	await expect(page.getByTestId('import-done')).toContainText('Imported 2 people, 1 relationship');
	await expect(page.getByTestId('import-done')).toContainText('2 to-dos');

	await page.getByLabel('Monica photo folder').setInputFiles(PHOTO_FOLDER);
	await expect(page.getByText('1 of 1 · 1 stored')).toBeVisible();
	await page.getByRole('button', { name: 'Finish' }).click();
	await expect(page).toHaveURL(/\/contacts$/);

	await page
		.getByRole('link', { name: /Ottilie Vogelsang/ })
		.first()
		.click();
	await expect(page.getByRole('heading', { name: 'Ottilie Vogelsang' })).toBeVisible();
	// The age-based birthday became an estimate, never a birthday.
	await expect(page.getByTestId('identity-facts')).toContainText('around 2016');
	const dates = await factEditor(page, 'dates');
	await expect(dates.getByText('estimated')).toBeVisible();
	// The mirrored Monica rows became one relationship, listed under the People tab.
	await expect(page.getByRole('link', { name: 'Kaspar Vogelsang', exact: true })).toBeVisible();
	await expect(page.getByText('Prefers the harbour walk in Tallinn.')).toBeVisible();
	// Monica's tasks (docs/02 §2.26.8): the open one on the card, the description after its
	// title; the completed one done in Activity on the day Monica completed it.
	await expect(todoRow(page, 'Buch zurückgeben — das rote, von Weihnachten')).toHaveCount(1);
	await expect(doneOn(page, '6 May 2024', 'Rezept schicken')).toContainText('Done');
	await expect(page.locator('img[alt="Ottilie Vogelsang"]')).toHaveAttribute(
		'src',
		/monica:photo:1/
	);
});

test('a second run of the same dump writes nothing twice', async ({ page }) => {
	await previewDump(page);
	await page.getByRole('button', { name: 'Import now' }).click();
	const done = page.getByTestId('import-done');
	await expect(done).toContainText('Imported 0 people');
	await expect(done).toContainText('Everything was already there, so nothing was written twice.');
	await page.getByLabel('Monica photo folder').setInputFiles(PHOTO_FOLDER);
	await expect(page.getByText('1 of 1 · 0 stored, 1 already there')).toBeVisible();
	// Still exactly one Ottilie in the list, with her task on the card once.
	await page.goto('/contacts');
	await expect(page.getByRole('link', { name: /Ottilie Vogelsang/ })).toHaveCount(1);
	await page.getByRole('link', { name: /Ottilie Vogelsang/ }).click();
	await expect(todoRow(page, 'Buch zurückgeben')).toHaveCount(1);
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

test('leaves out a relationship from a person to themselves and previews the rest', async ({
	page
}) => {
	// The mini dump plus one row linking Kaspar to himself; it used to fail the whole plan.
	// Preview only, so this spec writes nothing the other tests count on.
	await page.goto('/settings/import');
	await page.locator('input[name=dump]').setInputFiles('e2e/fixtures/monica-self-link.sql');
	await page.getByRole('button', { name: 'Preview' }).click();
	const preview = page.getByTestId('import-preview');
	await expect(preview.locator('div', { hasText: /^contacts/ })).toContainText('2');
	await expect(preview.locator('div', { hasText: /^relationships/ })).toContainText('1');
	await expect(page.getByText('1 relationship — links a person to themselves')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Import now' })).toBeEnabled();
});

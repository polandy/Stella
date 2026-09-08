import { expect, test, type Page } from '@playwright/test';
import { signIn } from './app';

/*
 * The third file the import wizard takes: a vCard (docs/02 §2.16, docs/monica-mapping.md).
 * Written after a real address-book export went through the wizard and was checked in the app
 * (docs/08 §8.4.1).
 *
 * What this file proves that neither Monica spec can: a `.vcf` is recognised with nothing to
 * pick, a format that carries people but no relationships says so instead of leaving the gap to
 * be noticed, vCard 2.1's quoted-printable text survives the whole way to the person's page, and
 * a card with no UID still becomes exactly one person. Its people (the Trachsels) appear in no
 * seed and in no other fixture, so these cases share the suite's one database safely.
 */

const VCARD = 'e2e/fixtures/contacts-mini.vcf';
const PHOTO_ID = 'vcard:photo:5e2a7c10-3333-4b8f-9d22-000000000001~photo0';

// The second case reads what the first one wrote.
test.describe.configure({ mode: 'serial' });

/** Upload → preview: returns once the preview is on screen. */
async function previewVCard(page: Page): Promise<void> {
	await page.goto('/settings/import');
	await page.locator('input[name=dump]').setInputFiles(VCARD);
	await page.getByRole('button', { name: 'Preview' }).click();
	await expect(page.getByTestId('import-preview')).toBeVisible();
}

/** Upload a file the reader must refuse, and return the wizard's own message. */
async function uploadBroken(page: Page, name: string, body: string): Promise<void> {
	await page.goto('/settings/import');
	await page.locator('input[name=dump]').setInputFiles({
		name,
		mimeType: 'text/vcard',
		buffer: Buffer.from(body)
	});
	await page.getByRole('button', { name: 'Preview' }).click();
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('imports a vCard, stores the picture it carries and shows the people', async ({ page }) => {
	await previewVCard(page);
	const preview = page.getByTestId('import-preview');
	await expect(preview.locator('div', { hasText: /^contacts/ })).toContainText('3');
	await expect(preview.locator('div', { hasText: /^contact fields/ })).toContainText('7');
	await expect(preview.locator('div', { hasText: /^tags/ })).toContainText('2');
	await expect(preview.locator('div', { hasText: /^photos/ })).toContainText('1');
	// A vCard has no way to say how people are connected, and the report says so.
	await expect(preview.locator('div', { hasText: /^relationships/ })).toContainText('0');
	await expect(page.getByText(/carries people only/)).toBeVisible();

	await page.getByRole('button', { name: 'Import now' }).click();
	await expect(page.getByTestId('import-done')).toContainText('Imported 3 people, 0 relationships');

	// The picture is inside the card, so there is nothing to point at — and the button that
	// replaces the folder picker is the positive control for that absence.
	await expect(page.getByLabel('Monica photo folder')).toHaveCount(0);
	await page.getByRole('button', { name: 'Store photos' }).click();
	// One of the two PHOTO lines was only a link, so its bytes were never in the file.
	await expect(page.getByText('1 of 1 · 1 stored')).toBeVisible();
	await page.getByRole('button', { name: 'Finish' }).click();
	await expect(page).toHaveURL(/\/contacts$/);

	await page.getByRole('link', { name: /Odile Margrit Trachsel/ }).first().click();
	await expect(page.getByRole('heading', { name: 'Odile Margrit Trachsel' })).toBeVisible();
	await expect(page.getByText('19 May 1984')).toBeVisible();
	await expect(
		page.locator('section', { has: page.getByText('Tags', { exact: true }) }).first()
	).toContainText('Jodlerchoerli');
	// The note was folded across lines and escaped its own comma; both survived.
	await page.getByRole('tab', { name: /Notes/ }).click();
	await expect(page.getByText('Leiht mir jedes Jahr das Zelt, ohne zu fragen.')).toBeVisible();
	// The picture went through the browser's resize pipeline and became the avatar.
	await expect(page.locator('img[alt="Odile Margrit Trachsel"]')).toHaveAttribute(
		'src',
		new RegExp(PHOTO_ID)
	);

	// The second card is vCard 2.1: quoted-printable text and a birthday with no year.
	await page.goto('/contacts');
	await page.getByRole('link', { name: /Bruno Trachsel/ }).first().click();
	await expect(page.getByText('3 September')).toBeVisible();
	await page.getByRole('tab', { name: /Notes/ }).click();
	await expect(page.getByText('Fischt am liebsten früh am Morgen im Thunersee.')).toBeVisible();

	// The third card has no UID at all, and is one person rather than none or two.
	await page.goto('/contacts');
	await expect(page.getByRole('link', { name: /Quartierverein Lerchenfeld/ })).toHaveCount(1);
});

test('a second run of the same vCard writes nothing twice', async ({ page }) => {
	await previewVCard(page);
	await page.getByRole('button', { name: 'Import now' }).click();
	const done = page.getByTestId('import-done');
	await expect(done).toContainText('Imported 0 people');
	await expect(done).toContainText('Everything was already there, so nothing was written twice.');
	await page.getByRole('button', { name: 'Store photos' }).click();
	await expect(page.getByText('1 of 1 · 0 stored, 1 already there')).toBeVisible();
	await page.goto('/contacts');
	await expect(page.getByRole('link', { name: /Odile Margrit Trachsel/ })).toHaveCount(1);
});

test('says so when a card is opened and never closed, and writes nothing', async ({ page }) => {
	await uploadBroken(page, 'truncated.vcf', 'BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Odile Trachsel\r\n');

	await expect(page.getByText(/never closed with END:VCARD/)).toBeVisible();
	// It failed before the preview, so nothing was planned, let alone written.
	await expect(page.getByTestId('import-preview')).toHaveCount(0);
});

test('refuses a card that names nobody rather than importing a nameless person', async ({ page }) => {
	await uploadBroken(page, 'nameless.vcf', 'BEGIN:VCARD\r\nVERSION:4.0\r\nUID:u9\r\nNOTE:no name here\r\nEND:VCARD\r\n');

	await expect(page.getByText(/names nobody/)).toBeVisible();
	await expect(page.getByTestId('import-preview')).toHaveCount(0);
});

import { expect, test, type Page } from '@playwright/test';
import { signIn } from './app';

/*
 * What a Google Contacts export brings to the vCard import (docs/02 §2.16) that a tidy address
 * book does not: a merged contact's repeated values, contacts that are only a number or a firm,
 * a contact saved twice, and Google's own CSV offered first. Written after a ~400-contact Google
 * file stopped at its first nameless card every time. Its people (Aaron Doppelt, Ueli Zwilling,
 * Gärtnerei Zbinden) appear in no seed and in no other fixture, so these cases share the suite's
 * one database safely.
 */

/** Upload a file the member picked; the wizard answers with a preview or its message. */
async function upload(page: Page, name: string, lines: string[]): Promise<void> {
	await page.goto('/settings/import');
	await page.locator('input[name=dump]').setInputFiles({
		name,
		mimeType: name.endsWith('.csv') ? 'text/csv' : 'text/vcard',
		buffer: Buffer.from(lines.join('\r\n'))
	});
	await page.getByRole('button', { name: 'Preview' }).click();
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('a value a Google card repeats comes in once, and the new person keeps the field labels', async ({
	page
}) => {
	// Google writes a merged contact's number twice, spelled two ways, and its email twice too.
	await upload(page, 'google.vcf', [
		'BEGIN:VCARD',
		'VERSION:3.0',
		'FN:Aaron Doppelt',
		'N:Doppelt;Aaron;;;',
		'TEL;TYPE=CELL:+41787200373',
		'TEL;TYPE=CELL:+41 78 720 03 73',
		'EMAIL;TYPE=INTERNET:aaron@example.ch',
		'EMAIL;TYPE=INTERNET:Aaron@Example.ch',
		'item1.EMAIL;TYPE=INTERNET:verein@example.ch',
		'item1.X-ABLabel:Verein',
		'END:VCARD',
		''
	]);
	const preview = page.getByTestId('import-preview');
	await expect(preview.locator('div', { hasText: /^contact fields/ })).toContainText('3');

	await page.getByRole('button', { name: 'Review contacts' }).click();
	const fresh = page.getByTestId('new-contacts');
	await fresh.getByRole('button', { name: 'Select all' }).click();
	await fresh.getByRole('button', { name: 'Add it as new' }).click();
	await page.getByRole('button', { name: 'Import 1 answer' }).click();
	await expect(page.getByTestId('import-done')).toContainText('0 completed, 1 new, 0 skipped.');
	await page.getByRole('button', { name: 'Finish' }).click();

	await page
		.getByRole('link', { name: /Aaron Doppelt/ })
		.first()
		.click();
	const contact = page.locator('section[data-row="Contact"]');
	await expect(contact.getByRole('link', { name: /720/ })).toHaveCount(1);
	await expect(contact.locator('dt', { hasText: /^Mobile$/ })).toHaveCount(1);
	await expect(contact.getByRole('link', { name: /aaron@example\.ch/i })).toHaveCount(1);
	// A label the card typed itself (Google's X-ABLabel) is kept as written.
	await expect(contact.locator('dt', { hasText: /^Verein$/ })).toHaveCount(1);
	await expect(contact.getByRole('link', { name: 'verein@example.ch' })).toBeVisible();
});

test('a contact that is only a firm, and one saved twice, come in with the rest', async ({
	page
}) => {
	// Google writes an empty `FN:` for a contact with no name, and a twice-saved one twice alike.
	const twin = [
		'BEGIN:VCARD',
		'VERSION:3.0',
		'FN:Ueli Zwilling',
		'N:Zwilling;Ueli;;;',
		'END:VCARD'
	];
	await upload(page, 'google-contacts.vcf', [
		...twin,
		'BEGIN:VCARD',
		'VERSION:3.0',
		'FN:',
		'N:;;;;',
		'ORG:Gärtnerei Zbinden',
		'TEL;TYPE=WORK:+41 31 000 00 07',
		'END:VCARD',
		...twin,
		''
	]);

	await page.getByRole('button', { name: 'Review contacts' }).click();
	await expect(page.getByTestId('contact-review')).toContainText('3 contacts in a vCard file.');
	const fresh = page.getByTestId('new-contacts');
	await fresh.getByRole('button', { name: 'Select all' }).click();
	await fresh.getByRole('button', { name: 'Add all 3 as new' }).click();
	await page.getByRole('button', { name: 'Import 3 answers' }).click();
	await expect(page.getByTestId('import-done')).toContainText('0 completed, 3 new, 0 skipped.');
	await page.getByRole('button', { name: 'Finish' }).click();

	// The firm is its name, and the twin the review asked about twice is two people.
	await expect(page.getByRole('link', { name: /Gärtnerei Zbinden/ })).toHaveCount(1);
	await expect(page.getByRole('link', { name: /Ueli Zwilling/ })).toHaveCount(2);

	// The same file again asks nothing: each card, the twins too, keeps its answer.
	await upload(page, 'google-contacts.vcf', [...twin, ...twin, '']);
	await page.getByRole('button', { name: 'Review contacts' }).click();
	await expect(page.getByTestId('contact-review')).toContainText(
		'Nothing to ask: every contact in this file has its answer.'
	);
});

test('says a Google CSV is one, and how to export the vCard instead', async ({ page }) => {
	await upload(page, 'contacts.csv', [
		'First Name,Middle Name,Last Name,Phonetic First Name',
		'Ueli,,Zwilling,',
		''
	]);

	await expect(page.getByText(/This is a CSV file/)).toBeVisible();
	await expect(page.getByText(/Export → vCard \(for iOS Contacts\)/)).toBeVisible();
	await expect(page.getByTestId('import-preview')).toHaveCount(0);
});

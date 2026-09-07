import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { appReady, openPerson, signIn } from './app';

/*
 * Reading the household's archive back in (docs/02 §2.15). Written after the maintainer
 * restored a deleted person in the running app (docs/08 §8.4.1).
 *
 * The shape of the suite is the shape of the promise: one archive is taken while somebody is
 * still here, that person is deleted, and the archive brings them back — with their note and
 * the bytes of their photo — while nothing else in the household moves. The suite shares one
 * database, so the person it deletes is invented here and appears in no other spec and in no
 * seed.
 */

const WHO = 'Valentina Ochsner';
const NOTE = 'Zieht im Frühling nach Chur.';
const PIXEL = readFileSync('e2e/fixtures/monica-photos/photos/ottilie-avatar.png');

/** The archive as the export hands it out, fetched with the signed-in session. */
async function takeArchive(page: Page): Promise<Buffer> {
	const response = await page.request.post('/settings/export');
	expect(response.status()).toBe(200);
	const bytes = Buffer.from(await response.body());
	// A tar of a demo household is never this small; a 0-byte "archive" would make every
	// case below pass for the wrong reason.
	expect(bytes.length).toBeGreaterThan(10_000);
	return bytes;
}

/** Uploads an archive on the restore screen and waits for the report. */
async function restore(page: Page, buffer: Buffer, name = 'stella-household.tar'): Promise<void> {
	await page.goto('/settings/import/archive');
	await page
		.locator('input[name=archive]')
		.setInputFiles({ name, mimeType: 'application/x-tar', buffer });
	await page.getByRole('button', { name: 'Restore' }).click();
}

/** The report line for one kind of record, e.g. `contact` → "1 added · 30 already here". */
const line = (page: Page, kind: string) =>
	page.getByTestId('restore-report').locator(`[data-kind="${kind}"]`);

test.describe.configure({ mode: 'serial' });

/** The archive taken in the first case; every case after it reads the same bytes back in. */
let archive: Buffer;

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('takes an archive while the person, their note and their photo are still here', async ({
	page
}) => {
	await page.goto('/contacts/new');
	await page.getByLabel('First name').fill('Valentina');
	await page.getByLabel('Last name').fill('Ochsner');
	await page.getByRole('button', { name: 'Add person' }).click();
	await expect(page.getByRole('heading', { name: WHO })).toBeVisible();
	await appReady(page);

	await page.getByRole('tab', { name: /Notes/ }).click();
	await page.getByRole('button', { name: 'Add note' }).click();
	await page.getByRole('textbox', { name: 'Note' }).fill(NOTE);
	await page.getByRole('button', { name: 'Add note' }).click();
	await expect(page.getByTestId('toast-notice')).toContainText('Saved');

	await page.getByRole('tab', { name: /Photos/ }).click();
	await page.getByRole('button', { name: 'Add photos' }).click();
	const form = page.locator('#panel-photos form');
	await form
		.locator('input[name=files]')
		.setInputFiles({ name: 'valentina.png', mimeType: 'image/png', buffer: PIXEL });
	await form.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.locator('#panel-photos img').first()).toBeVisible();

	archive = await takeArchive(page);
	// Read as UTF-8, not byte-for-byte: the document is UTF-8 inside the tar, and "Frühling"
	// is two bytes that a latin1 reading would show as two characters.
	expect(archive.toString('utf8')).toContain(NOTE);
});

test('brings back a person who was deleted, with what was written about them', async ({ page }) => {
	await openPerson(page, new RegExp(WHO));
	await page.getByRole('button', { name: 'Delete for good' }).click();
	await page.getByRole('button', { name: `Delete ${WHO}` }).click();
	await expect(page.getByRole('link', { name: new RegExp(WHO) })).toHaveCount(0);

	await restore(page, archive);

	// One person came back; everybody else was recognised as already here and left alone.
	await expect(line(page, 'contact')).toContainText('1 added');
	await expect(line(page, 'contact')).toContainText('already here');
	await expect(line(page, 'note')).toContainText('1 added');

	await openPerson(page, new RegExp(WHO));
	await page.getByRole('tab', { name: /Notes/ }).click();
	await expect(page.getByText(NOTE)).toBeVisible();
});

test('puts the bytes of their photo back on disk, not just the row', async ({ page }) => {
	await openPerson(page, new RegExp(WHO));
	await page.getByRole('tab', { name: /Photos/ }).click();
	const image = page.locator('#panel-photos img').first();
	await expect(image).toBeVisible();

	// Asking the server for the file itself: a restored row pointing at a file the restore
	// forgot to write would still render an <img> tag.
	const src = await image.getAttribute('src');
	const response = await page.request.get(src!);
	expect(response.status()).toBe(200);
	expect((await response.body()).byteLength).toBeGreaterThan(0);
});

test('changes nothing at all the second time the same archive is read', async ({ page }) => {
	await restore(page, archive);

	await expect(line(page, 'contact')).toContainText('0 added');
	await expect(line(page, 'contact')).toContainText('already here');
	await expect(line(page, 'note')).toContainText('0 added');

	// And the person is still there once, not twice.
	await page.getByRole('link', { name: 'People' }).first().click();
	await expect(page.getByRole('link', { name: new RegExp(WHO) })).toHaveCount(1);
});

test('leaves an edit made since the archive was taken exactly as it is', async ({ page }) => {
	const AFTER = 'Neu: wohnt jetzt in Chur.';
	await openPerson(page, new RegExp(WHO));
	await page.getByRole('button', { name: 'Add a description' }).click();
	await page.getByRole('textbox', { name: 'Edit description' }).fill(AFTER);
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText(AFTER)).toBeVisible();

	await restore(page, archive);
	// Positive control: the restore really ran over this person's record.
	await expect(line(page, 'contact')).toContainText('already here');

	await openPerson(page, new RegExp(WHO));
	await expect(page.getByText(AFTER)).toBeVisible();
});

test('tells the household in the stream that the archive was restored', async ({ page }) => {
	await page.getByRole('link', { name: 'Home' }).first().click();
	await expect(page.getByRole('heading', { name: 'What happened?' })).toBeVisible();
	await expect(page.locator('article').first()).toContainText('restored');
});

test('says what is wrong with a file that is not an archive, and writes nothing', async ({
	page
}) => {
	await restore(page, Buffer.from('format: not really\n'.repeat(40)), 'notes.txt');

	await expect(page.getByTestId('restore-error')).toBeVisible();
	await expect(page.getByTestId('restore-report')).toHaveCount(0);
	// Positive control: the household is untouched and the good archive still reads.
	await restore(page, archive);
	await expect(page.getByTestId('restore-report')).toBeVisible();
});

import { expect, test, type Download, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { appReady, signIn } from './app';

/*
 * Taking the household's data out (docs/02 §2.15). Written after the archive was unpacked and
 * read in the running app (docs/08 §8.4.1).
 *
 * The cases read the downloaded bytes rather than trusting the response, because the promise
 * this feature makes is about what is *inside* the file: one readable document, the images
 * beside it, and people identified by an id rather than by a name.
 */

const TAR_BLOCK = 512;

/** The entry names and contents of a tar, read the way any reader reads one: block by block. */
function readTar(bytes: Uint8Array): Map<string, Uint8Array> {
	const decoder = new TextDecoder();
	const entries = new Map<string, Uint8Array>();
	let at = 0;
	while (at + TAR_BLOCK <= bytes.length) {
		const header = bytes.subarray(at, at + TAR_BLOCK);
		if (header.every((b) => b === 0)) break; // the trailer
		const name = decoder.decode(header.subarray(0, 100)).replace(/\0.*$/, '');
		const size = parseInt(decoder.decode(header.subarray(124, 136)).replace(/\0.*$/, '').trim(), 8);
		const start = at + TAR_BLOCK;
		entries.set(name, bytes.subarray(start, start + size));
		at = start + Math.ceil(size / TAR_BLOCK) * TAR_BLOCK;
	}
	return entries;
}

/** Clicks the download card and hands back what the browser saved. */
async function downloadArchive(page: Page): Promise<{ download: Download; bytes: Uint8Array }> {
	const waiting = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Download the archive' }).click();
	const download = await waiting;
	const path = await download.path();
	return { download, bytes: new Uint8Array(await readFile(path)) };
}

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
	await signIn(page);
	await page.getByRole('link', { name: 'Settings' }).first().click();
	await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
	await appReady(page);
});

test('hands the admin one file named for the household and the day', async ({ page }) => {
	const { download } = await downloadArchive(page);
	expect(download.suggestedFilename()).toMatch(/^stella-familie-brunner-\d{4}-\d{2}-\d{2}\.tar$/);
});

test('holds one readable text file, with the images beside it', async ({ page }) => {
	const { bytes } = await downloadArchive(page);
	const entries = readTar(bytes);

	expect([...entries.keys()]).toContain('household.yaml');
	// Every other entry is an image, in its own directory beside the document.
	for (const name of entries.keys()) {
		if (name !== 'household.yaml') expect(name.startsWith('media/')).toBe(true);
	}

	const yaml = new TextDecoder().decode(entries.get('household.yaml'));
	// Block style, one thing per line — the file is meant to be read, not only parsed.
	expect(yaml.split('\n').length).toBeGreaterThan(200);
	expect(yaml).toContain('format: stella-archive');
	expect(yaml).toContain('household: Familie Brunner');
});

test('names people by an id, so two people with one name stay two people', async ({ page }) => {
	const { bytes } = await downloadArchive(page);
	const yaml = new TextDecoder().decode(readTar(bytes).get('household.yaml'));

	// The demo household's people are in it, each under their own key…
	expect(yaml).toContain('display_name: Hans Brunner');
	const ids = [...yaml.matchAll(/^ {2}- id: (\S+)$/gm)].map((m) => m[1]);
	expect(ids.length).toBeGreaterThan(20);
	expect(new Set(ids).size).toBe(ids.length);

	// …and the relationships point at those ids rather than at names.
	const [firstLink] = [...yaml.matchAll(/^ {4}from: (\S+)\n {4}to: (\S+)$/gm)];
	expect(ids).toContain(firstLink[1]);
	expect(ids).toContain(firstLink[2]);
});

test('carries the private records too, marked as private', async ({ page }) => {
	// Something private to find: without it the case would pass against an archive that
	// silently drops private rows, which is the failure this is here to catch.
	await page.getByRole('link', { name: 'People' }).first().click();
	await page.getByRole('link', { name: /Bettina Roth/ }).first().click();
	await appReady(page);
	await page.getByRole('tab', { name: /Notes/ }).click();
	await page.getByRole('button', { name: 'Add note' }).click();
	await page.getByRole('textbox', { name: 'Note' }).fill('Schlüssel liegt unter dem Stein.');
	await page.getByRole('radio', { name: 'Private' }).first().check();
	await page.getByRole('button', { name: 'Add note' }).click();
	await expect(page.getByTestId('toast-notice')).toContainText('Saved');

	await page.getByRole('link', { name: 'Settings' }).first().click();
	const { bytes } = await downloadArchive(page);
	const yaml = new TextDecoder().decode(readTar(bytes).get('household.yaml'));

	expect(yaml).toContain('Schlüssel liegt unter dem Stein.');
	expect(yaml).toMatch(/Schlüssel liegt unter dem Stein\.[\s\S]{0,200}visibility: private/);
});

test('never carries a password out of the server', async ({ page }) => {
	const { bytes } = await downloadArchive(page);
	const yaml = new TextDecoder().decode(readTar(bytes).get('household.yaml'));

	expect(yaml).not.toContain('password_hash');
	expect(yaml).not.toContain('$argon2');
	// Positive control: the members are in there, which is what makes the absence meaningful.
	expect(yaml).toContain('email: demo@stella.local');
});

test('tells the household in the stream that the archive was taken', async ({ page }) => {
	await downloadArchive(page);

	await page.getByRole('link', { name: 'Home' }).first().click();
	await expect(page.getByRole('heading', { name: 'What happened?' })).toBeVisible();
	await expect(page.locator('article').first()).toContainText('exported the household archive');
});

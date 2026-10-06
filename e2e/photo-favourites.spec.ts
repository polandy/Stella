import { expect, test, type Browser, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { addPerson, appReady, openPerson, signIn } from './app';
import { DEMO_ADMIN_PASSWORD, DEMO_MEMBER_EMAIL } from '../src/lib/server/db/demo-seed';

/*
 * Pinning a person's photos as favourites (docs/02 §2.14). Written after the owner tried the
 * pins in the running app (docs/08 §8.4.1).
 *
 * The suite shares one database and runs serially, so every case photographs a person of its
 * own, added here under a name the demo households do not use. Each photo gets a caption,
 * because the caption is the tile's alt text and so the only thing that tells tiles apart.
 */

const PIXEL = readFileSync('e2e/fixtures/monica-photos/photos/ottilie-avatar.png');

/** One photo, added through the disclosure, then captioned from the lightbox. */
async function addCaptionedPhoto(
	page: Page,
	caption: string,
	visibility: 'shared' | 'private' = 'shared'
): Promise<void> {
	const grid = page.getByTestId('photo-grid');
	const before = await grid.locator('img').count();
	await page.getByRole('button', { name: 'Add photos' }).click();
	const form = page.locator('#section-photos form');
	await form
		.locator('input[name=files]')
		.setInputFiles({ name: `${caption}.png`, mimeType: 'image/png', buffer: PIXEL });
	if (visibility === 'private') await form.getByText('Private', { exact: true }).click();
	await form.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(grid.locator('img')).toHaveCount(before + 1);

	// Nothing is pinned while the photos go in, so the newest one leads the grid.
	await grid.getByRole('button').first().click();
	const lightbox = page.getByTestId('photo-lightbox');
	await expect(lightbox).toContainText('No caption');
	await lightbox.getByLabel('Caption').fill(caption);
	await lightbox.getByRole('button', { name: 'Save' }).click();
	await expect(grid.getByRole('img', { name: caption, exact: true })).toHaveCount(1);
}

/** The grid's captions, in the order the tiles are shown. */
const shownOrder = (page: Page) => page.getByTestId('photo-grid').locator('li img');

/** Opens a photo by its caption and presses the lightbox's pin toggle. */
async function togglePin(
	page: Page,
	caption: string,
	action: 'Pin as favourite' | 'Unpin favourite'
): Promise<void> {
	await page.getByTestId('photo-grid').getByRole('img', { name: caption, exact: true }).click();
	const lightbox = page.getByTestId('photo-lightbox');
	await expect(lightbox).toContainText(caption);
	await lightbox.getByRole('button', { name: action }).click();
	await expect(lightbox).toBeHidden();
}

/** A second browser signed in as the household's other member, Nina. */
async function signInAsNina(browser: Browser): Promise<Page> {
	const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
	const page = await context.newPage();
	await page.goto('/login');
	await page.getByLabel('Email').fill(DEMO_MEMBER_EMAIL);
	await page.getByLabel('Password').fill(DEMO_ADMIN_PASSWORD);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'What happened?' })).toBeVisible();
	await appReady(page);
	return page;
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('puts a pinned photo first with a star, the latest pin ahead, and an unpinned one back by date', async ({
	page
}) => {
	await addPerson(page, 'Ottavia', 'Bernasconi');
	for (const caption of ['Fav oldest', 'Fav middle', 'Fav newest'])
		await addCaptionedPhoto(page, caption);
	await expect(page.getByTestId('photo-grid').locator('li img')).toHaveCount(3);
	const order = async () =>
		shownOrder(page).evaluateAll((imgs) => imgs.map((img) => img.getAttribute('alt')));

	// Newest first, and nobody starred.
	await expect.poll(order).toEqual(['Fav newest', 'Fav middle', 'Fav oldest']);
	await expect(page.getByTestId('photo-favourite')).toHaveCount(0);

	// Pinning the oldest brings it to the front, starred, and named a favourite.
	await togglePin(page, 'Fav oldest', 'Pin as favourite');
	await expect.poll(order).toEqual(['Fav oldest', 'Fav newest', 'Fav middle']);
	const grid = page.getByTestId('photo-grid');
	await expect(grid.getByRole('button', { name: 'Fav oldest Favourite' })).toHaveCount(1);
	await expect(grid.getByRole('button', { name: 'Fav newest', exact: true })).toHaveCount(1);
	await expect(page.getByTestId('photo-favourite')).toHaveCount(1);

	// Reopened, the lightbox says so and offers the way back.
	await grid.getByRole('img', { name: 'Fav oldest', exact: true }).click();
	const lightbox = page.getByTestId('photo-lightbox');
	await expect(lightbox.getByRole('button', { name: 'Unpin favourite' })).toBeVisible();
	await expect(lightbox).toContainText('Favourite');
	await lightbox.getByRole('button', { name: 'Close', exact: true }).click();

	// A second pin leads, ahead of the first.
	await togglePin(page, 'Fav middle', 'Pin as favourite');
	await expect.poll(order).toEqual(['Fav middle', 'Fav oldest', 'Fav newest']);
	await expect(page.getByTestId('photo-favourite')).toHaveCount(2);

	// Unpinned, the first pin falls back to where its date puts it.
	await togglePin(page, 'Fav oldest', 'Unpin favourite');
	await expect.poll(order).toEqual(['Fav middle', 'Fav newest', 'Fav oldest']);
	await expect(page.getByTestId('photo-favourite')).toHaveCount(1);
});

test('shows the other member the same favourites first, lets them unpin, and hides a private pin', async ({
	page,
	browser
}) => {
	await addPerson(page, 'Ludovico', 'Bernasconi');
	await addCaptionedPhoto(page, 'Shared pin');
	await addCaptionedPhoto(page, 'Shared plain');
	await addCaptionedPhoto(page, 'Private pin', 'private');
	await togglePin(page, 'Shared pin', 'Pin as favourite');
	await togglePin(page, 'Private pin', 'Pin as favourite');
	const order = (on: Page) => () =>
		shownOrder(on).evaluateAll((imgs) => imgs.map((img) => img.getAttribute('alt')));
	await expect.poll(order(page)).toEqual(['Private pin', 'Shared pin', 'Shared plain']);

	const nina = await signInAsNina(browser);
	try {
		await openPerson(nina, /Ludovico Bernasconi/);
		// The shared favourite leads for her too; the private one is not there at all — the
		// shared tiles beside it are what make that absence mean something.
		await expect.poll(order(nina)).toEqual(['Shared pin', 'Shared plain']);
		await expect(nina.getByTestId('photo-favourite')).toHaveCount(1);
		await expect(
			nina.getByTestId('photo-grid').getByRole('img', { name: 'Private pin' })
		).toHaveCount(0);

		// She may unpin a photo she did not add; it is the household's pin, not the adder's.
		await togglePin(nina, 'Shared pin', 'Unpin favourite');
		await expect(nina.getByTestId('photo-favourite')).toHaveCount(0);
		await expect.poll(order(nina)).toEqual(['Shared plain', 'Shared pin']);
	} finally {
		await nina.context().close();
	}

	// Her unpin is the admin's view too; the private pin still leads here.
	await page.reload();
	await expect.poll(order(page)).toEqual(['Private pin', 'Shared plain', 'Shared pin']);
	await expect(page.getByTestId('photo-favourite')).toHaveCount(1);
});

test('carries the pin into the archive on the photo that has it', async ({ page }) => {
	await addPerson(page, 'Serafina', 'Bernasconi');
	await addCaptionedPhoto(page, 'Archived favourite');
	await addCaptionedPhoto(page, 'Archived ordinary');
	await togglePin(page, 'Archived favourite', 'Pin as favourite');

	await page.getByRole('link', { name: 'Settings' }).first().click();
	await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
	await appReady(page);
	const waiting = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Download the archive' }).click();
	const yaml = documentOf(new Uint8Array(readFileSync(await (await waiting).path())));

	// The unpinned photo is the positive control: a document that stamps every photo, or none,
	// fails one of the two.
	expect(photoBlock(yaml, 'Archived favourite')).toMatch(/pinned_at: \S*\d{4}-\d{2}-\d{2}T/);
	expect(photoBlock(yaml, 'Archived ordinary')).toContain('caption: Archived ordinary');
	expect(photoBlock(yaml, 'Archived ordinary')).not.toContain('pinned_at');
});

/** `household.yaml` out of the downloaded tar, read block by block. */
function documentOf(bytes: Uint8Array): string {
	const decoder = new TextDecoder();
	let at = 0;
	while (at + 512 <= bytes.length) {
		const header = bytes.subarray(at, at + 512);
		if (header.every((b) => b === 0)) break;
		const name = decoder.decode(header.subarray(0, 100)).replace(/\0.*$/, '');
		const size = parseInt(decoder.decode(header.subarray(124, 136)).replace(/\0.*$/, '').trim(), 8);
		if (name === 'household.yaml') return decoder.decode(bytes.subarray(at + 512, at + 512 + size));
		at += 512 + Math.ceil(size / 512) * 512;
	}
	throw new Error('The archive holds no household.yaml.');
}

/** The lines of the one photo entry carrying this caption, up to the next list item. */
function photoBlock(yaml: string, caption: string): string {
	const lines = yaml.split('\n');
	const at = lines.findIndex((line) => line.trim() === `caption: ${caption}`);
	if (at === -1) throw new Error(`No photo captioned "${caption}" in the archive.`);
	let start = at;
	while (start > 0 && !/^\s*- /.test(lines[start])) start--;
	let end = at + 1;
	while (
		end < lines.length &&
		!/^\s*- /.test(lines[end]) &&
		lines[end].search(/\S/) >= lines[start].search(/\S/) + 2
	)
		end++;
	return lines.slice(start, end).join('\n');
}

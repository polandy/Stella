import { expect, test, type Locator, type Page } from '@playwright/test';
import { addPerson, appReady, openComposer, pickPerson, signIn } from './app';

/*
 * A person with a photo wears it wherever they are listed to be found or picked (docs/05
 * §5.10, docs/02 §2.9): the person pickers, the @-lists and the search results. Written after
 * the maintainer verified it in the app (docs/08 §8.4.1).
 *
 * The suite shares one database, so the person is new and uniquely named, and each case
 * expects exactly the thumbnail their own page shows — not merely some photo.
 */

/** Letters only, so the name stays one searchable, mentionable word. */
function runLetters(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) => String.fromCharCode(97 + (byte % 26))).join('');
}

/** A small square PNG drawn in the browser, so no fixture file is needed. */
async function picture(page: Page): Promise<Buffer> {
	const bytes = await page.evaluate(async () => {
		const canvas = document.createElement('canvas');
		canvas.width = 200;
		canvas.height = 200;
		const ctx = canvas.getContext('2d')!;
		ctx.fillStyle = '#00aa00';
		ctx.fillRect(0, 0, 200, 200);
		const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
		return Array.from(new Uint8Array(await blob.arrayBuffer()));
	});
	return Buffer.from(bytes);
}

/** Adds someone with a photo; answers with their name, their id and their avatar's `src`. */
async function personWithAPhoto(page: Page): Promise<{ name: string; id: string; src: string }> {
	const last = `Bildli${runLetters()}`;
	await addPerson(page, 'Fiona', last);
	const id = /\/contacts\/([^/?#]+)/.exec(page.url())![1];

	const uploader = page.getByTestId('avatar-uploader');
	await uploader.locator('input[type=file]').setInputFiles({
		name: 'face.png',
		mimeType: 'image/png',
		buffer: await picture(page)
	});
	const cropper = page.getByTestId('photo-cropper');
	await cropper.getByRole('button', { name: 'Use photo' }).click();
	await expect(cropper).toBeHidden();

	const avatar = uploader.locator('img');
	await expect(avatar).toHaveAttribute('src', /\/media\//);
	return { name: `Fiona ${last}`, id, src: (await avatar.getAttribute('src'))! };
}

/** The photo inside a listed person, by its `src`. */
const photoIn = (row: Locator, src: string) => row.locator(`img[src="${src}"]`);

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('shows the photo in a circle’s person picker and in the chip it picks', async ({ page }) => {
	const { name, src } = await personWithAPhoto(page);
	await page.goto('/circles');
	await page.getByTestId('circle-cards').getByRole('link', { name: /Musikschule/ }).click();
	await page.getByRole('button', { name: 'Add people' }).click();
	const form = page.locator('form[action="?/addMembers"]');
	const field = form.getByLabel('People');

	await field.click();
	await field.fill(name);
	await expect(photoIn(page.getByRole('option', { name }), src)).toBeVisible();

	await field.fill('');
	await pickPerson(field, name);
	await expect(photoIn(form, src)).toBeVisible();
});

test('shows the photo in the moment composer’s @-list', async ({ page }) => {
	const { name, src } = await personWithAPhoto(page);
	await openComposer(page);

	await page.getByLabel('What happened?').pressSequentially(`@${name.split(' ')[1]}`);
	await expect(photoIn(page.getByRole('option', { name }), src)).toBeVisible();
});

test('shows the photo in a journal’s @-list', async ({ page }) => {
	const { name, src } = await personWithAPhoto(page);
	// Somebody else's journal: the person whose journal it is is not offered there.
	await addPerson(page, 'Jonas', `Tagebuch${runLetters()}`);
	await page.goto(`${new URL(page.url()).pathname}/journal`);
	await appReady(page);

	await page.getByRole('button', { name: 'New entry' }).click();
	await page.getByRole('textbox', { name: 'Entry' }).pressSequentially(`@${name.split(' ')[1]}`);
	await expect(photoIn(page.getByRole('option', { name }), src)).toBeVisible();
});

test('shows the photo in the search results', async ({ page }) => {
	const { name, id, src } = await personWithAPhoto(page);
	await page.goto(`/search?q=${encodeURIComponent(name.split(' ')[1])}`);

	// Only the page's own result list: ⌘K lists the same person with the same photo, and
	// whether its rows are rendered yet is a race that must not decide this case.
	const results = page
		.locator('section')
		.filter({ has: page.getByRole('heading', { name: 'People', exact: true }) });
	await expect(photoIn(results.locator(`a[href="/contacts/${id}"]`), src)).toBeVisible();
});

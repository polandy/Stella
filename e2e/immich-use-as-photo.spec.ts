import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { addPerson, appReady, signIn } from './app';

/*
 * A photo from Immich as the person's own photo (docs/02 §2.24.6):
 * *Use as photo* in the Immich viewer, and *From Immich* in the picture's chooser. Written after
 * the owner tried #245 in the preview (docs/08 §8.4.1).
 *
 * The e2e server runs with `IMMICH_DEMO=true`: Immich is the in-memory demo library, whose
 * photos are solid tiles dated a day apart, newest first. One Immich face links to one person
 * only, and the faces are shared by the whole suite (`immich-link.spec.ts` takes Elias, Hans and
 * Thomas), so every case links a person it adds itself to a face no other case links.
 */

const PIXEL = readFileSync('e2e/fixtures/monica-photos/photos/ottilie-avatar.png');

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

/** The person's picture at the top of the page — the button that chooses a new one. */
const portrait = (page: Page) =>
	page.getByTestId('avatar-uploader').getByRole('button', { name: /^(Add a photo|Change photo)$/ });

/** The picture the person wears, absent while they have none. */
const worn = (page: Page) => portrait(page).locator('img');

const cropper = (page: Page) => page.getByRole('dialog', { name: 'Frame the photo' });
const viewer = (page: Page) => page.getByTestId('immich-viewer');
const galleryPhotos = (page: Page) => page.getByTestId('photo-grid').locator('li img');

/** Opens the Photos card's Immich menu and picks one of its items. */
async function immichMenu(
	page: Page,
	item: 'Find in Immich' | 'Unlink from Immich'
): Promise<void> {
	await page.getByRole('button', { name: 'Photo library options' }).click();
	await page.getByRole('menuitem', { name: item }).click();
}

/**
 * Searches the open face picker for `faceName` and picks it for `personName`. The picker first
 * searches the person's own name, which no demo face carries; its "nobody" answer is the settled
 * state the second search starts from.
 */
async function pickFace(page: Page, personName: string, faceName: string): Promise<Locator> {
	const picker = page.getByRole('dialog', {
		name: `Find ${personName} in Immich`
	});
	await expect(
		picker.getByText('No face in Immich has this name.', { exact: false })
	).toBeVisible();
	await picker.getByRole('searchbox', { name: 'Name in Immich' }).fill(faceName);
	await picker.getByRole('button', { name: 'Search' }).click();
	await picker.getByRole('button', { name: `Link ${faceName} to ${personName}` }).click();
	await expect(picker).toBeHidden();
	return picker;
}

/** Links the person on screen through the Photos card, which reloads the page with the link. */
async function linkFace(page: Page, personName: string, faceName: string): Promise<void> {
	await immichMenu(page, 'Find in Immich');
	await pickFace(page, personName, faceName);
	await appReady(page);
}

/** The strip's photo at `index`, and the day it was taken as the page says it. */
async function stripPhoto(page: Page, index: number): Promise<{ tile: Locator; day: string }> {
	const strip = page.getByTestId('immich-strip');
	await expect(strip).toHaveAttribute('data-phase', 'shown');
	const tile = strip.getByRole('button').nth(index);
	const alt = await tile.locator('img').getAttribute('alt');
	const day = /^Photo from (.+), in Immich$/.exec(alt ?? '')?.[1];
	if (!day) throw new Error(`The strip's photo has no day in its description: ${alt}`);
	return { tile, day };
}

/** Opens the strip's newest photo in the viewer; the day it was taken. */
async function openNewestInViewer(page: Page): Promise<string> {
	const { tile, day } = await stripPhoto(page, 0);
	await tile.click();
	await expect(viewer(page)).toContainText(`Taken ${day}`);
	return day;
}

/** *Use as photo* in the viewer, up to the cropper ready on the preview. */
async function cropFromViewer(page: Page): Promise<void> {
	await viewer(page).getByRole('button', { name: 'Use as photo' }).click();
	await expect(cropper(page).getByRole('button', { name: 'Use photo' })).toBeEnabled();
}

/** The gallery's only photo opened in the lightbox says it was taken on `day`. */
async function expectOnlyGalleryPhotoTaken(page: Page, day: string): Promise<void> {
	await expect(galleryPhotos(page)).toHaveCount(1);
	await page.getByTestId('photo-grid').getByRole('button').first().click();
	await expect(page.getByTestId('photo-lightbox').getByTestId('photo-date')).toHaveText(
		`Taken ${day}`
	);
}

test('Use as photo in the viewer keeps the crop as their picture, dated by Immich; a cancel keeps nothing', async ({
	page
}) => {
	await addPerson(page, 'Quirin', 'Fotomann');
	await linkFace(page, 'Quirin Fotomann', 'Markus Brunner');
	const day = await openNewestInViewer(page);

	await cropFromViewer(page);
	await page.keyboard.press('Escape');
	await expect(cropper(page)).toBeHidden();
	await expect(viewer(page)).toBeVisible();
	await expect(worn(page)).toHaveCount(0);
	await expect(galleryPhotos(page)).toHaveCount(0);

	// The same photo used now is stored, so the checks above were not locators that could never
	// find a picture — and a cancelled crop does not block the next one.
	await cropFromViewer(page);
	await cropper(page).getByRole('button', { name: 'Use photo' }).click();

	await expect(viewer(page)).toBeHidden();
	await expect(worn(page)).toHaveAttribute('src', /\/media\//);
	// They had no photo, so nothing went back to the gallery and no toast says so.
	await expect(page.getByText('The previous photo is still in Photos.')).toHaveCount(0);
	await expectOnlyGalleryPhotoTaken(page, day);
});

test('Use as photo keeps the previous picture in the gallery and says so', async ({ page }) => {
	await addPerson(page, 'Quirina', 'Fotomann');
	// Their own picture first, from a file.
	await page.getByTestId('avatar-uploader').locator('input[type=file]').setInputFiles({
		name: 'before.png',
		mimeType: 'image/png',
		buffer: PIXEL
	});
	await cropper(page).getByRole('button', { name: 'Use photo' }).click();
	await expect(worn(page)).toHaveAttribute('src', /\/media\//);
	const before = await worn(page).getAttribute('src');
	await expect(galleryPhotos(page)).toHaveCount(1);

	await linkFace(page, 'Quirina Fotomann', 'Sandra Brunner');
	await openNewestInViewer(page);
	await cropFromViewer(page);
	await cropper(page).getByRole('button', { name: 'Use photo' }).click();

	await expect(page.getByText('The previous photo is still in Photos.')).toBeVisible();
	await expect(worn(page)).not.toHaveAttribute('src', before!);
	await expect(galleryPhotos(page)).toHaveCount(2);
});

test('a person unlinked while the cropper is open is refused, and nothing is stored', async ({
	page
}) => {
	await addPerson(page, 'Quilla', 'Fotomann');
	await linkFace(page, 'Quilla Fotomann', 'Noah Brunner');
	const personUrl = page.url();
	await openNewestInViewer(page);
	await cropFromViewer(page);

	// Another tab of the same member unlinks them meanwhile.
	const other = await page.context().newPage();
	try {
		await other.goto(personUrl);
		await appReady(other);
		await immichMenu(other, 'Unlink from Immich');
		await appReady(other);
		await other.getByRole('button', { name: 'Photo library options' }).click();
		await expect(other.getByRole('menuitem', { name: 'Find in Immich' })).toBeVisible();
	} finally {
		await other.close();
	}

	await cropper(page).getByRole('button', { name: 'Use photo' }).click();
	await expect(
		viewer(page).getByText('Couldn’t keep this photo. Reload the page and try again.')
	).toBeVisible();
	await expect(worn(page)).toHaveCount(0);
	// Read again from the server, so the gallery is what was stored rather than what was shown.
	await page.reload();
	await appReady(page);
	await expect(page.getByRole('heading', { name: 'Quilla Fotomann' })).toBeVisible();
	await expect(worn(page)).toHaveCount(0);
	await expect(galleryPhotos(page)).toHaveCount(0);
});

test('the chooser offers a linked person’s latest Immich photos', async ({ page }) => {
	await addPerson(page, 'Quinta', 'Fotomann');
	await linkFace(page, 'Quinta Fotomann', 'Rosa Brunner');
	const { day } = await stripPhoto(page, 0);

	await portrait(page).click();
	const chooser = page.getByTestId('avatar-chooser');
	await expect(chooser.getByRole('heading', { name: 'From Immich' })).toBeVisible();
	await expect(chooser.getByRole('button', { name: 'Choose a picture…' })).toBeVisible();
	const photos = chooser.getByTestId('avatar-immich-photos').getByRole('button');
	await expect(photos).toHaveCount(12);

	await chooser.getByRole('button', { name: `Photo from ${day}, in Immich` }).click();
	await expect(chooser).toBeHidden();
	await cropper(page).getByRole('button', { name: 'Use photo' }).click();

	await expect(worn(page)).toHaveAttribute('src', /\/media\//);
	await expectOnlyGalleryPhotoTaken(page, day);
});

test('the chooser links an unlinked person in place and then shows their Immich photos', async ({
	page
}) => {
	await addPerson(page, 'Quiro', 'Fotomann');

	await portrait(page).click();
	const chooser = page.getByTestId('avatar-chooser');
	await expect(
		chooser.getByText('Quiro Fotomann isn’t linked to a face in Immich yet.')
	).toBeVisible();
	await expect(chooser.getByTestId('avatar-immich-photos')).toHaveCount(0);
	await chooser.getByRole('button', { name: 'Find in Immich' }).click();
	await expect(chooser).toBeHidden();

	await pickFace(page, 'Quiro Fotomann', 'Lena Brunner');

	// Linked in place: the chooser comes back on its own, now with their latest twelve.
	await expect(chooser).toBeVisible();
	await expect(chooser.getByTestId('avatar-immich-photos').getByRole('button')).toHaveCount(12);
	await expect(
		chooser.getByText('Quiro Fotomann isn’t linked to a face in Immich yet.')
	).toHaveCount(0);
});

import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { addPerson, appReady, signIn } from './app';
import { DEMO_ADMIN_PASSWORD, DEMO_MEMBER_EMAIL } from '../src/lib/server/db/demo-seed';

/*
 * A taken face in *Find in Immich* opens its holder's photos (docs/02 §2.24.2, §2.24.6, docs/04
 * ADR-124): a group photo of someone else may hold this person, unnamed in Immich, and its
 * square becomes their picture. Written after the owner tried #377 in the preview
 * (docs/08 §8.4.1).
 *
 * The e2e server runs with `IMMICH_DEMO=true`, whose library holds faces made for this spec
 * (`src/lib/server/immich/demo-library.ts`): the Bilderbogens and the Schattenwurfs, which no
 * other spec searches for or links. Every case adds the people it links, under names no face
 * carries, so the picker's first search — the person's own name — answers "nobody".
 */

const PIXEL = readFileSync('e2e/fixtures/monica-photos/photos/ottilie-avatar.png');

/** The photos Immich has of Gisbert: more than one page of twelve, so *Show more* loads more. */
const GISBERT = { name: 'Gisbert Bilderbogen', photos: 20 };
const GERTRUD = { name: 'Gertrud Bilderbogen' };
const KONRAD = { name: 'Konrad Schattenwurf' };
const LORENZ = { name: 'Lorenz Schattenwurf' };
const FIRST_PAGE = 12;

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

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

/** The person's picture at the top of the page — the button that chooses a new one. */
const portrait = (page: Page) =>
	page.getByTestId('avatar-uploader').getByRole('button', { name: /^(Add a photo|Change photo)$/ });

/** The picture the person wears, absent while they have none. */
const worn = (page: Page) => portrait(page).locator('img');

const cropper = (page: Page) => page.getByRole('dialog', { name: 'Frame the photo' });

/** The photos of the face's holder, as the picker shows them while browsing. */
const browsedPhotos = (picker: Locator) =>
	picker.getByTestId('immich-browse-photos').getByRole('button');

/**
 * Searches the open picker of `personName` for `faceName`. The picker first searches the
 * person's own name, which no demo face carries; its "nobody" answer is the settled state the
 * second search starts from.
 */
async function searchFaces(page: Page, personName: string, faceName: string): Promise<Locator> {
	const picker = page.getByRole('dialog', { name: `Find ${personName} in Immich` });
	await expect(
		picker.getByText('No face in Immich has this name.', { exact: false })
	).toBeVisible();
	await picker.getByRole('searchbox', { name: 'Name in Immich' }).fill(faceName);
	await picker.getByRole('button', { name: 'Search' }).click();
	return picker;
}

/** Opens *Find in Immich* from the Photos card's menu and searches it for `faceName`. */
async function findFromPhotosCard(
	page: Page,
	personName: string,
	faceName: string
): Promise<Locator> {
	await page.getByRole('button', { name: 'Photo library options' }).click();
	await page.getByRole('menuitem', { name: 'Find in Immich' }).click();
	return searchFaces(page, personName, faceName);
}

/** Links the person on screen to the demo face of that name; the pick reloads the page. */
async function linkFace(page: Page, personName: string, faceName: string): Promise<void> {
	const picker = await findFromPhotosCard(page, personName, faceName);
	await picker.getByRole('button', { name: `Link ${faceName} to ${personName}` }).click();
	await expect(picker).toBeHidden();
	await appReady(page);
}

/** Adds a person only the member on `page` can see, through the real form. */
async function addPrivatePerson(page: Page, first: string, last: string): Promise<void> {
	await page.goto('/contacts/new');
	await page.getByLabel('First name').fill(first);
	await page.getByLabel('Last name').fill(last);
	await page.getByRole('radio', { name: 'Private' }).check();
	await page.getByRole('button', { name: 'Add person' }).click();
	await expect(page.getByRole('heading', { name: `${first} ${last}` })).toBeVisible();
	await appReady(page);
}

test('a face linked to someone else opens their photos, and one becomes this person’s picture', async ({
	page
}) => {
	await addPerson(page, 'Gundula', 'Fremdbild');
	await linkFace(page, 'Gundula Fremdbild', GISBERT.name);

	await addPerson(page, 'Hiltrud', 'Fremdbild');
	const picker = await findFromPhotosCard(page, 'Hiltrud Fremdbild', GISBERT.name);
	const face = picker.getByRole('button', { name: 'Show photos of Gundula Fremdbild' });
	await expect(face).toContainText('Linked to Gundula Fremdbild');
	await face.click();

	// Gundula's photos, a page at a time, inside the picker.
	await expect(picker.getByRole('heading', { name: 'Photos of Gundula Fremdbild' })).toBeVisible();
	await expect(browsedPhotos(picker)).toHaveCount(FIRST_PAGE);
	await picker.getByRole('button', { name: 'Show more' }).click();
	await expect(browsedPhotos(picker)).toHaveCount(GISBERT.photos);
	await expect(picker.getByRole('button', { name: 'Show more' })).toHaveCount(0);

	// Back to the faces, and in again: the same face still opens the photos.
	await picker.getByRole('button', { name: 'Back to faces' }).click();
	await expect(face).toBeVisible();
	await expect(picker.getByTestId('immich-browse')).toHaveCount(0);
	await face.click();
	await expect(browsedPhotos(picker)).toHaveCount(FIRST_PAGE);

	// A cancelled crop comes back to the photos and keeps nothing.
	await browsedPhotos(picker).first().click();
	await expect(cropper(page).getByRole('button', { name: 'Use photo' })).toBeEnabled();
	await cropper(page).getByRole('button', { name: 'Cancel' }).click();
	await expect(cropper(page)).toBeHidden();
	await expect(browsedPhotos(picker)).toHaveCount(FIRST_PAGE);
	await expect(worn(page)).toHaveCount(0);

	await browsedPhotos(picker).first().click();
	await cropper(page).getByRole('button', { name: 'Use photo' }).click();

	await expect(picker).toBeHidden();
	await expect(worn(page)).toHaveAttribute('src', /\/media\//);
	// She had no photo, so nothing went back to the gallery and no toast says so.
	await expect(page.getByText('The previous photo is still in Photos.')).toHaveCount(0);
	// Nothing was linked: Hiltrud is still not in Immich, and the menu still offers the search.
	await page.getByRole('button', { name: 'Photo library options' }).click();
	await expect(page.getByRole('menuitem', { name: 'Find in Immich' })).toBeVisible();
});

test('from the picture’s chooser, a photo of someone else replaces the picture and keeps the old one', async ({
	page
}) => {
	await addPerson(page, 'Brigitta', 'Fremdbild');
	await linkFace(page, 'Brigitta Fremdbild', GERTRUD.name);

	await addPerson(page, 'Zenzi', 'Fremdbild');
	await page.getByTestId('avatar-uploader').locator('input[type=file]').setInputFiles({
		name: 'before.png',
		mimeType: 'image/png',
		buffer: PIXEL
	});
	await cropper(page).getByRole('button', { name: 'Use photo' }).click();
	await expect(worn(page)).toHaveAttribute('src', /\/media\//);
	const before = await worn(page).getAttribute('src');

	await portrait(page).click();
	const chooser = page.getByTestId('avatar-chooser');
	await chooser.getByRole('button', { name: 'Find in Immich' }).click();
	await expect(chooser).toBeHidden();
	const picker = await searchFaces(page, 'Zenzi Fremdbild', GERTRUD.name);
	await picker.getByRole('button', { name: 'Show photos of Brigitta Fremdbild' }).click();
	await browsedPhotos(picker).first().click();
	await cropper(page).getByRole('button', { name: 'Use photo' }).click();

	await expect(picker).toBeHidden();
	await expect(page.getByText('The previous photo is still in Photos.')).toBeVisible();
	await expect(worn(page)).toHaveAttribute('src', /\/media\//);
	await expect(worn(page)).not.toHaveAttribute('src', before!);
});

test('a face held by someone the member cannot see stays locked beside one that opens', async ({
	page,
	browser
}) => {
	// Nina links Konrad's face to a person only she can see.
	const nina = await signInAsNina(browser);
	try {
		await addPrivatePerson(nina, 'Kunigunde', 'Lichtung');
		await linkFace(nina, 'Kunigunde Lichtung', KONRAD.name);
	} finally {
		await nina.context().close();
	}

	// The admin links Lorenz's to a shared person of hers.
	await addPerson(page, 'Ludmila', 'Lichtung');
	await linkFace(page, 'Ludmila Lichtung', LORENZ.name);

	await addPerson(page, 'Oda', 'Lichtung');
	const picker = await findFromPhotosCard(page, 'Oda Lichtung', 'Schattenwurf');

	// The face she may see the holder of opens their photos — the answer that makes the locked
	// one's missing button mean something.
	await expect(picker.getByTestId('immich-face-taken')).toHaveCount(2);
	await expect(
		picker.getByRole('button', { name: 'Show photos of Ludmila Lichtung' })
	).toContainText(LORENZ.name);

	const locked = picker.getByTestId('immich-face-taken').filter({ hasText: KONRAD.name });
	await expect(locked).toContainText('Linked to someone else');
	await expect(locked).not.toContainText('Kunigunde');
	await expect(picker.getByRole('button').filter({ hasText: KONRAD.name })).toHaveCount(0);
});

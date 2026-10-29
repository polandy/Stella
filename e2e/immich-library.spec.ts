import { expect, test, type Locator, type Page } from '@playwright/test';
import { addPerson, appReady, signIn } from './app';

/*
 * Photos from the whole Immich library wherever a photo can be added (docs/02 §2.24.9): the
 * photo menu of a moment and of a journal entry, *or From Immich* beside a person's and a
 * circle's gallery, the sheet's day arrows, ticks and smart search. Written after the owner
 * tried #407 in the preview (docs/08 §8.4.1). Offline, *From Immich* is greyed out; that needs
 * the service worker's reachability, so it is a case of `pwa-offline.spec.ts`.
 *
 * The e2e server runs with `IMMICH_DEMO=true`: the in-memory demo library, whose newest photos
 * were taken on 1 September 2026 at 15:30, one per person and group. The sheet opens on today,
 * which is later, so *An earlier day with photos* lands on that day whenever the suite runs.
 * Its smart search finds a person's own photos by a word of their name, and nothing else.
 *
 * Each case adds the people and circle it saves to, invented here and in no seed: copies land
 * on nobody another spec counts.
 */

const NEWEST_DAY = 'Tuesday, 1 September 2026';

/** Six letters no other attempt shares. */
function runLetters(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) =>
		String.fromCharCode(97 + (byte % 26))
	).join('');
}

/** A surname only this case uses, capitalised as a name typed by hand would be. */
const surname = () => `Bildmann${runLetters()}`;

const sheet = (page: Page) => page.getByTestId('immich-library');
const tiles = (page: Page) => sheet(page).getByTestId('immich-library-photos').getByRole('button');
const dayLine = (page: Page) => sheet(page).getByTestId('immich-library-day');

/** Opens *From Immich* from the photo menu of a moment or a journal entry. */
async function fromImmichInMenu(page: Page, menuButton: Locator): Promise<void> {
	await menuButton.click();
	await page.getByRole('menuitem', { name: 'From Immich' }).click();
	await expect(sheet(page)).toBeVisible();
}

/** Steps the open sheet back to the library's newest day, which has photos. */
async function toNewestDay(page: Page): Promise<void> {
	await sheet(page).getByRole('button', { name: 'An earlier day with photos' }).click();
	await expect(dayLine(page)).toContainText(NEWEST_DAY);
	await expect(tiles(page).first()).toBeVisible();
}

/** Ticks the first `count` photos of the day and adds them; waits for the sheet to close. */
async function addFirst(page: Page, count: number): Promise<void> {
	for (let index = 0; index < count; index++) await tiles(page).nth(index).click();
	const add = count === 1 ? 'Add 1 photo' : `Add ${count} photos`;
	await sheet(page).getByRole('button', { name: add, exact: true }).click();
	await expect(sheet(page)).toBeHidden();
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('a moment takes photos from Immich through the photo menu, ticked in order', async ({
	page
}) => {
	const last = surname();
	await addPerson(page, 'Momenta', last);
	await page.getByTestId('identity-actions').getByRole('link', { name: 'Write a moment' }).click();
	const composer = page.getByTestId('story-composer');
	const field = composer.getByRole('textbox', { name: 'What happened with Momenta?' });
	await expect(field).toBeFocused();
	await field.fill('a picnic by the lake, photos from Immich');

	await fromImmichInMenu(page, composer.getByRole('button', { name: 'Add photos' }));
	await toNewestDay(page);
	await expect(tiles(page).first()).toHaveAccessibleName('Photo, 15:30');

	// Ticks are numbered in the order they were made; an untick moves the later ones up.
	const [first, second, third] = [tiles(page).nth(0), tiles(page).nth(1), tiles(page).nth(2)];
	await first.click();
	await second.click();
	await expect(first).toHaveAttribute('aria-pressed', 'true');
	await expect(first).toContainText('1');
	await expect(second).toContainText('2');
	await expect(sheet(page)).toContainText('2 ticked');
	await first.click();
	await expect(first).toHaveAttribute('aria-pressed', 'false');
	await expect(second).toContainText('1');
	await third.click();
	await expect(third).toContainText('2');

	await sheet(page).getByRole('button', { name: 'Add 2 photos', exact: true }).click();
	await expect(sheet(page)).toBeHidden();
	await expect(page.getByTestId('toasts').getByText('2 photos from Immich added')).toBeVisible();
	await expect(composer.getByTestId('photo-count')).toHaveText('2');

	await composer.getByRole('button', { name: /^Save/ }).click();
	const saved = page
		.locator('#section-story [data-story-item]')
		.filter({ hasText: 'a picnic by the lake, photos from Immich' });
	await expect(saved.locator('img')).toHaveCount(2);
});

test('the sheet searches the whole library, says when nothing matches, and goes back to the day', async ({
	page
}) => {
	await fromImmichInMenu(page, page.getByRole('button', { name: 'Add photos' }));
	await toNewestDay(page);

	const search = sheet(page).getByRole('searchbox', { name: /^Search Immich/ });
	await search.fill('Lena');
	await search.press('Enter');
	await expect(sheet(page).getByText('Best matches for “Lena”')).toBeVisible();
	// A search spans days, so a tile says the date it was taken, not the time.
	await expect(tiles(page).first()).toHaveAccessibleName('Photo, 1 Sept 2026');

	await search.fill('Zebracorn');
	await search.press('Enter');
	await expect(sheet(page).getByText('Nothing in Immich matches “Zebracorn”.')).toBeVisible();
	await expect(tiles(page)).toHaveCount(0);

	await sheet(page).getByRole('button', { name: 'Clear the search' }).click();
	await expect(dayLine(page)).toContainText(NEWEST_DAY);
	await expect(search).toHaveValue('');
	await expect(tiles(page).first()).toBeVisible();
});

test('a journal entry takes a photo from Immich through its photo menu', async ({ page }) => {
	await addPerson(page, 'Journa', surname());
	await page.getByRole('link', { name: 'Open journal' }).click();
	await expect(page.getByRole('heading', { name: 'Journal' })).toBeVisible();
	await page.getByRole('button', { name: 'Write a moment' }).click();

	await fromImmichInMenu(page, page.getByRole('button', { name: 'Add photos' }));
	await toNewestDay(page);
	await addFirst(page, 1);
	await expect(page.getByText('1 photo ready')).toBeVisible();

	await page
		.getByRole('textbox', { name: 'Moment', exact: true })
		.fill('an entry with a photo from Immich');
	await page.getByRole('button', { name: 'Save moment' }).click();
	const entry = page.locator('article', { hasText: 'an entry with a photo from Immich' });
	await expect(entry.locator('img')).toHaveCount(1);
});

test('a person’s gallery takes a photo from Immich, dated as Immich dates it', async ({ page }) => {
	await addPerson(page, 'Galina', surname());
	await page.getByRole('button', { name: 'Add photos' }).click();
	const form = page.locator('#section-photos form');
	await form.getByTestId('from-immich').click();
	await expect(sheet(page)).toBeVisible();
	await toNewestDay(page);
	await addFirst(page, 1);
	await expect(form.getByTestId('from-immich-count')).toHaveText('1 photo from Immich');

	// No file was picked: the copy alone fills the upload.
	await form.getByRole('button', { name: 'Add', exact: true }).click();
	const grid = page.getByTestId('photo-grid').locator('li[data-source="stella"]');
	await expect(grid).toHaveCount(1);
	await grid.getByRole('button').click();
	await expect(page.getByTestId('photo-lightbox').getByTestId('photo-date')).toHaveText(
		'Taken 1 September 2026'
	);
});

test('a circle’s gallery takes a photo from Immich', async ({ page }) => {
	const name = `Fotokreis ${runLetters()}`;
	await page.goto('/circles');
	await appReady(page);
	await page.getByRole('button', { name: 'New circle' }).click();
	await page.getByLabel('Name').fill(name);
	await page.getByRole('button', { name: 'Create circle' }).click();
	await expect(page.getByRole('heading', { name })).toBeVisible();

	await page.getByRole('button', { name: 'Add photos' }).click();
	const form = page.locator('#photos form');
	await form.getByTestId('from-immich').click();
	await expect(sheet(page)).toBeVisible();
	await toNewestDay(page);
	await addFirst(page, 1);
	await expect(form.getByTestId('from-immich-count')).toHaveText('1 photo from Immich');

	await form.getByRole('button', { name: /^Add \d+ photos?$/ }).click();
	await expect(page.getByTestId('circle-photo-grid').locator('[data-photo-tile]')).toHaveCount(1);
});

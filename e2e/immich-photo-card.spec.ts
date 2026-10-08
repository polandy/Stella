import { expect, test, type Locator, type Page } from '@playwright/test';
import { addPerson, signIn } from './app';
import { CARD_FACE, linkCardFace, photoTab, unlinkFace, uploadPhotos } from './photo-card';

/*
 * The person page's Photos card (docs/02 §2.14, §2.24.3, docs/design/screens/person.md): the
 * tabs *All · Stella n · Immich n* over one grid, *All*'s glance of one row with its last tile
 * *All n photos*, *Show more* under Immich's, and the one lightbox that walks the list its tile
 * was opened from. Written after the owner tried #309 in the preview (docs/08 §8.4.1).
 *
 * The e2e server runs with `IMMICH_DEMO=true`. Every case adds a person of its own, gives them two
 * gallery photos and links them to the demo face Luca Widmer (210 photos), which it unlinks again
 * afterwards (`e2e/photo-card.ts`). The demo's Immich photos are dated 1 September 2026 and
 * before, so the gallery photos a case uploads are newer than all of them and lead *All*. The glance's shape is read off the tiles' boxes, not their
 * classes: what is measured is what the reader sees.
 */

/** The person pages a case linked, unlinked again after it. */
const linkedHere: string[] = [];

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test.afterEach(async ({ page }) => {
	while (linkedHere.length > 0) await unlinkFace(page, linkedHere.pop()!);
});

/** Adds a person with two gallery photos, linked to the demo face unless `linked` is false. */
async function personWithPhotos(page: Page, first: string, linked = true): Promise<string> {
	const name = `${first} Kartenbild`;
	await addPerson(page, first, 'Kartenbild');
	await uploadPhotos(page, 2);
	if (linked) await link(page, name);
	return name;
}

async function link(page: Page, name: string): Promise<void> {
	linkedHere.push(new URL(page.url()).pathname);
	await linkCardFace(page, name);
}

/** The card's grid for one tab. */
const grid = (page: Page, view: 'all' | 'stella' | 'immich') =>
	page.getByTestId('photo-grid').and(page.locator(`[data-view="${view}"]`));
const allTile = (page: Page) => page.getByTestId('photo-all-tile');
const lightbox = (page: Page) => page.getByTestId('photo-lightbox');
const position = (page: Page) => lightbox(page).getByTestId('photo-position');

/** The grid's tiles a reader sees, by where their boxes sit: hidden ones have no box. */
function seenTiles(list: Locator): Promise<{ x: number; y: number }[]> {
	return list.locator(':scope > li').evaluateAll((items) =>
		items
			.filter((item) => item.getClientRects().length > 0)
			.map((item) => {
				const box = item.getBoundingClientRect();
				return { x: Math.round(box.left), y: Math.round(box.top) };
			})
	);
}
const distinct = (values: number[]) => new Set(values).size;

/** *All* once Immich's first page is in: its Immich tiles are there, not placeholders. */
async function allShown(page: Page): Promise<Locator> {
	const all = grid(page, 'all');
	await expect(all.locator('li[data-source="immich"]').first()).toBeVisible();
	await expect(allTile(page)).toBeVisible();
	return all;
}

/** How many photos the open lightbox walks, read off its "n of m". */
async function walked(page: Page): Promise<number> {
	const text = (await position(page).textContent()) ?? '';
	const count = /^\d+ of (\d+)$/.exec(text.trim())?.[1];
	if (!count) throw new Error(`The lightbox does not say where it is: ${text}`);
	return Number(count);
}

test('an unlinked person has All and Stella, a linked one Immich too, and the arrow keys move between them', async ({
	page
}) => {
	const name = await personWithPhotos(page, 'Tabea', false);
	const tabs = page.getByTestId('photo-tabs').getByRole('tab');
	await expect(tabs).toHaveCount(2);
	await expect(photoTab(page, 'All')).toHaveText('All');
	await expect(photoTab(page, 'Stella')).toHaveText(/^Stella\s*2$/);
	await expect(photoTab(page, 'Immich')).toHaveCount(0);

	await link(page, name);
	await expect(tabs).toHaveCount(3);
	await expect(photoTab(page, 'All')).toHaveAttribute('aria-selected', 'true');

	// One Tab stop, the chosen tab; the arrows move it and wrap at either end.
	await photoTab(page, 'Stella').click();
	await expect(photoTab(page, 'Stella')).toBeFocused();
	await expect(grid(page, 'stella')).toBeVisible();
	await page.keyboard.press('ArrowRight');
	await expect(photoTab(page, 'Immich')).toHaveAttribute('aria-selected', 'true');
	await expect(photoTab(page, 'Immich')).toBeFocused();
	await expect(grid(page, 'immich')).toBeVisible();
	await page.keyboard.press('ArrowRight');
	await expect(photoTab(page, 'All')).toHaveAttribute('aria-selected', 'true');
	await expect(photoTab(page, 'All')).toBeFocused();
	await expect(photoTab(page, 'Immich')).toHaveAttribute('aria-selected', 'false');
	await page.keyboard.press('ArrowLeft');
	await expect(photoTab(page, 'Immich')).toBeFocused();
	await page.keyboard.press('ArrowLeft');
	await expect(photoTab(page, 'Stella')).toHaveAttribute('aria-selected', 'true');
	await expect(photoTab(page, 'Stella')).toHaveAttribute('tabindex', '0');
	await expect(photoTab(page, 'All')).toHaveAttribute('tabindex', '-1');
});

test('All is one row of seven, the last one All n photos, a favourite first and Immich’s marked', async ({
	page
}) => {
	await personWithPhotos(page, 'Glanzina');
	const all = await allShown(page);
	const total = 2 + CARD_FACE.photos;
	await expect(allTile(page)).toHaveText(`All ${total} photos`);

	const tiles = await seenTiles(all);
	expect(tiles).toHaveLength(7);
	expect(distinct(tiles.map((tile) => tile.y))).toBe(1);
	// The tile *All n photos* is the row's last.
	const allBox = await allTile(page).boundingBox();
	expect(Math.round(allBox!.x)).toBe(Math.max(...tiles.map((tile) => tile.x)));

	// Every Immich tile says so; a gallery tile does not.
	const immichTiles = all.locator('li[data-source="immich"]');
	const stellaTiles = all.locator('li[data-source="stella"]');
	await expect(immichTiles).toHaveCount(4);
	await expect(immichTiles.getByTestId('photo-immich-badge')).toHaveCount(4);
	await expect(stellaTiles).toHaveCount(2);
	await expect(stellaTiles.getByTestId('photo-immich-badge')).toHaveCount(0);

	// The gallery's second photo, pinned, comes first.
	const keys = () =>
		all
			.locator('li button[data-photo-key]')
			.evaluateAll((buttons) => buttons.map((button) => button.getAttribute('data-photo-key')));
	const [firstKey, secondKey] = await keys();
	expect(secondKey).toMatch(/^stella:/);
	await all.locator(`button[data-photo-key="${secondKey}"]`).click();
	// The pin closes the lightbox, as in the gallery (`photo-favourites.spec.ts`).
	await lightbox(page).getByRole('button', { name: 'Pin as favourite' }).click();
	await expect(lightbox(page)).toBeHidden();
	await expect.poll(async () => (await keys()).slice(0, 2)).toEqual([secondKey, firstKey]);
	await expect(all.locator('li').first().getByTestId('photo-favourite')).toBeVisible();

	// *All n photos* opens All out in place: every photo loaded so far, and Show more.
	await allTile(page).click();
	await expect(allTile(page)).toHaveCount(0);
	await expect(immichTiles).toHaveCount(12);
	expect(distinct((await seenTiles(all)).map((tile) => tile.y))).toBeGreaterThan(1);
	await expect(page.getByTestId('immich-show-more')).toBeVisible();
});

test.describe('on a phone', () => {
	test.use({ viewport: { width: 412, height: 915 }, hasTouch: true });

	test('All is two rows of three, the last one All n photos', async ({ page }) => {
		await personWithPhotos(page, 'Telefina');
		const all = await allShown(page);
		const tiles = await seenTiles(all);
		expect(tiles).toHaveLength(6);
		expect(distinct(tiles.map((tile) => tile.x))).toBe(3);
		expect(distinct(tiles.map((tile) => tile.y))).toBe(2);
		const allBox = await allTile(page).boundingBox();
		expect(Math.round(allBox!.y)).toBe(Math.max(...tiles.map((tile) => tile.y)));
		expect(Math.round(allBox!.x)).toBe(Math.max(...tiles.map((tile) => tile.x)));
	});
});

test('Immich’s Show more adds twelve photos below', async ({ page }) => {
	await personWithPhotos(page, 'Mehrina');
	await photoTab(page, 'Immich').click();
	const immich = grid(page, 'immich');
	const tiles = immich.locator('li');
	await expect(tiles).toHaveCount(12);
	// Immich's own tab needs no badge to say where its photos live.
	await expect(immich.getByTestId('photo-immich-badge')).toHaveCount(0);
	await expect(tiles.locator('img').first()).toHaveAttribute('alt', /in Immich$/);
	const keys = () =>
		immich
			.locator('li button[data-photo-key]')
			.evaluateAll((buttons) => buttons.map((button) => button.getAttribute('data-photo-key')));
	const before = await keys();

	await page.getByTestId('immich-show-more').click();
	await expect(tiles).toHaveCount(24);
	// The first twelve stay where they were, and the grid grows downward, not sideways.
	expect((await keys()).slice(0, 12)).toEqual(before);
	const [lastBefore, lastAdded] = await tiles.evaluateAll((items) =>
		[items[11], items[23]].map((item) => item!.getBoundingClientRect().top)
	);
	expect(lastAdded).toBeGreaterThan(lastBefore!);
	expect(await immich.evaluate((list) => list.scrollWidth <= list.clientWidth)).toBe(true);
});

test('the lightbox walks only the list its tile was opened from, wraps, and offers what the photo allows', async ({
	page
}) => {
	await personWithPhotos(page, 'Blätterine');
	const open = lightbox(page);
	const source = open.getByTestId('photo-source');
	const inImmich = open.getByRole('link', { name: 'Open in Immich' });
	const useAsPhoto = open.getByRole('button', { name: 'Use as photo' });

	// Stella: its two photos, and nothing from Immich.
	await photoTab(page, 'Stella').click();
	await grid(page, 'stella').getByRole('button').first().click();
	await expect(position(page)).toHaveText('1 of 2');
	await expect(source).toHaveText('Stella');
	await expect(useAsPhoto).toBeVisible();
	await expect(inImmich).toHaveCount(0);
	await page.keyboard.press('ArrowRight');
	await expect(position(page)).toHaveText('2 of 2');
	await page.keyboard.press('ArrowRight');
	await expect(position(page)).toHaveText('1 of 2');
	await page.keyboard.press('ArrowLeft');
	await expect(position(page)).toHaveText('2 of 2');
	await expect(source).toHaveText('Stella');
	await page.keyboard.press('Escape');
	await expect(open).toBeHidden();

	// Immich: its first page, every photo from Immich.
	await photoTab(page, 'Immich').click();
	await grid(page, 'immich').getByRole('button').first().click();
	await expect(position(page)).toHaveText('1 of 12');
	await expect(source).toHaveText('Immich');
	await expect(inImmich).toBeVisible();
	await expect(useAsPhoto).toBeVisible();
	await page.keyboard.press('ArrowLeft');
	await expect(position(page)).toHaveText('12 of 12');
	await expect(source).toHaveText('Immich');
	await page.keyboard.press('ArrowRight');
	await expect(position(page)).toHaveText('1 of 12');
	await page.keyboard.press('Escape');
	await expect(open).toBeHidden();

	// All: both, past what the glance shows; the gallery's two lead.
	await photoTab(page, 'All').click();
	await (await allShown(page)).getByRole('button').first().click();
	await expect(position(page)).toHaveText(/^1 of \d+$/);
	const count = await walked(page);
	expect(count).toBeGreaterThan(12);
	await expect(source).toHaveText('Stella');
	await expect(inImmich).toHaveCount(0);
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('ArrowRight');
	await expect(position(page)).toHaveText(`3 of ${count}`);
	await expect(source).toHaveText('Immich');
	await expect(inImmich).toBeVisible();
	await expect(useAsPhoto).toBeVisible();
	await page.keyboard.press('ArrowLeft');
	await page.keyboard.press('ArrowLeft');
	await page.keyboard.press('ArrowLeft');
	await expect(position(page)).toHaveText(`${count} of ${count}`);
});

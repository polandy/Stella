import { expect, test } from '@playwright/test';
import { fillDate, openPerson, signIn } from './app';

/*
 * The landing view of a person's page (docs/05 §5.5). The page is one column of cards in a
 * fixed order — the identity card, relationships, photos, then story and notes, gifts, then
 * mentions —
 * with no tabs to open: what a reader came for is on the page when they arrive. Written after
 * the maintainer saw the reordered page live, on the family instance itself (docs/08 §8.4.1);
 * the identity card's cases were updated for its redesign.
 */

/** The cards below the identity card, in the order the page stacks them. */
const CARDS = ['relationships', 'photos', 'story', 'notes', 'gifts', 'mentions'] as const;

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('lands with every card on the page, relationships first and the map above its list', async ({
	page
}) => {
	// Noah: others' stories name him, so *Mentioned in* is on the page too — at zero it is not
	// (docs/05 §5.5).
	await openPerson(page, /Noah Brunner/);

	// Nothing waits behind a click any more, so there is no tablist left to click.
	await expect(page.getByRole('tab')).toHaveCount(0);
	for (const card of CARDS) {
		await expect(page.locator(`#section-${card}`)).toBeVisible();
	}

	// The order is what this page is about: who he is, then his people, then his photos.
	// Story and notes may stand side by side, so the order is read off their tops, not equal.
	const identity = (await page.getByTestId('identity-card').boundingBox())!.y;
	const tops = await Promise.all(
		CARDS.map(async (card) => (await page.locator(`#section-${card}`).boundingBox())!.y)
	);
	expect(identity).toBeLessThan(tops[0]);
	expect(tops).toEqual([...tops].sort((a, b) => a - b));

	// Inside the relationships card the map is a preview strip across the top, and the list
	// takes the card's whole width beneath it (docs/05 §5.5).
	const map = page.getByTestId('person-map-preview');
	await expect(map).toBeVisible();
	const mapBox = (await map.boundingBox())!;
	const listBox = (await page.getByTestId('relationship-list').boundingBox())!;
	expect(mapBox.y + mapBox.height).toBeLessThanOrEqual(listBox.y);
	expect(listBox.width).toBeGreaterThanOrEqual(mapBox.width - 1);

	// The story card carries its own name rather than borrowing a tab's.
	await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible();
});

test('the identity card shows the rows it holds and folds the empty ones behind one button', async ({
	page
}) => {
	await openPerson(page, /Lena Brunner/);

	const card = page.getByTestId('identity-card');
	// She is in circles: they are stated among the facts, and edited there, behind their +.
	await expect(card.getByTestId('identity-facts')).toContainText('Klasse 5b');
	await expect(card.getByRole('button', { name: 'Join a circle' })).toBeVisible();

	// She has no tags, so that row waits behind the quiet button — and adding the first one
	// is one press of it away.
	const addMore = card.getByTestId('identity-add-more');
	await expect(addMore).toBeVisible();
	await expect(card.locator('section[data-row="Tags"]')).toHaveCount(0);

	await addMore.click();
	await expect(card.locator('section[data-row="Tags"]')).toBeVisible();
	await expect(addMore).toHaveCount(0);
});

test('logging a touchpoint comes back to the story card it was submitted from', async ({
	page
}) => {
	await openPerson(page, /Lena Brunner/);

	const story = page.locator('#section-story');
	const entries = story.getByTestId('story-timeline').locator('> li');
	const before = await entries.count();

	await story.getByRole('button', { name: 'Log contact' }).click();
	await story.getByLabel('Kind').selectOption('call');
	await fillDate(story, 'Day', '2026-01-05');
	await story.getByRole('button', { name: 'Log interaction' }).click();

	// This form posts natively, so the page reloads: the redirect has to land back on the card
	// it was submitted from rather than at the top of the page.
	await expect(page).toHaveURL(/#section-story$/);
	await expect(entries).toHaveCount(before + 1);
});

test('a bookmark still holding the old ?tab= is answered with the card it meant', async ({
	page
}) => {
	await openPerson(page, /Lena Brunner/);
	const id = new URL(page.url()).pathname.split('/').pop()!;

	// The tabs are gone, but the links people saved are not (docs/05 §5.5).
	await page.goto(`/contacts/${id}?tab=photos`);

	await expect(page).toHaveURL(`/contacts/${id}#section-photos`);
	await expect(page.locator('#section-photos')).toBeVisible();
});

import { expect, test } from '@playwright/test';
import { fillDate, openPerson, signIn } from './app';

/*
 * The landing view of a person's page (docs/05 §5.5). The page is one column of cards in a
 * fixed order — relationships, story, notes, photos, mentions — with no tabs to open: what a
 * reader came for is on the page when they arrive, and the profile they look things up in sits
 * quietly beside it. Written after the maintainer saw the reordered page live, on the family
 * instance itself (docs/08 §8.4.1).
 */

/** The cards of the main column, in the order the page stacks them. */
const CARDS = ['relationships', 'story', 'notes', 'photos', 'mentions'] as const;

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('lands with every card on the page, relationships first and the map above its list', async ({
	page
}) => {
	await openPerson(page, /Lena Brunner/);

	// Nothing waits behind a click any more, so there is no tablist left to click.
	await expect(page.getByRole('tab')).toHaveCount(0);
	for (const card of CARDS) {
		await expect(page.locator(`#section-${card}`)).toBeVisible();
	}

	// The order is what this change is about: relationships lead, the story follows.
	const tops = await Promise.all(
		CARDS.map(async (card) => (await page.locator(`#section-${card}`).boundingBox())!.y)
	);
	expect(tops).toEqual([...tops].sort((a, b) => a - b));

	// Inside the relationships card, the map is read before the rows it summarises.
	const graph = page.getByRole('img', { name: /Relationship network for Lena Brunner/ });
	await expect(graph).toBeVisible();
	const list = page.locator('#section-relationships ul').first();
	expect((await graph.boundingBox())!.y).toBeLessThan((await list.boundingBox())!.y);

	// The story card carries its own name rather than borrowing a tab's.
	await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible();
});

test('the profile card unfolds what it holds and folds away what it does not', async ({
	page
}) => {
	await openPerson(page, /Lena Brunner/);

	const profile = page.locator('section', { has: page.getByRole('heading', { name: 'Profile' }) });
	const circles = profile.getByRole('button', { name: /^Circles/ });
	const tags = profile.getByRole('button', { name: /^Tags/ });

	// She is in circles, so that row is open and its content is on the page.
	await expect(circles).toHaveAttribute('aria-expanded', 'true');
	await expect(profile).toContainText('Klasse 5b');

	// She has no tags, so that row is folded — but adding the first one is still one click,
	// because the row keeps its Add button while folded.
	await expect(tags).toHaveAttribute('aria-expanded', 'false');
	await expect(profile).not.toContainText('No tags yet.');

	await tags.click();
	await expect(tags).toHaveAttribute('aria-expanded', 'true');
	await expect(profile).toContainText('No tags yet.');
});

test('logging a touchpoint comes back to the story card it was submitted from', async ({ page }) => {
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

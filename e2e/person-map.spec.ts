import { expect, test, type Page } from '@playwright/test';
import { openPerson, pickPerson, signIn } from './app';
import {
	clickNode,
	firstClickableNode,
	nodeOwners,
	ringsOnCanvas,
	filterMenu,
	settled,
	stateOf
} from './graph-canvas';

/*
 * The map on a person's page (docs/05 §5.5, §5.8): the same explorer the graph route runs,
 * with a narrower brief — this person stays in the middle, the map reaches two hops, and the
 * toolbar drops what is about travelling the household. Written after the maintainer saw it
 * live (docs/08 §8.4.1).
 */

const LENA = 'demo-c-lena';
/** Lena's father: on her page whatever the layout does, so the no-JS case can name him. */
const MARKUS = 'demo-c-markus';
/*
 * Somebody the seed links to nobody, so she cannot already be on Lena's map however the
 * household grows — and linking her is a change no other case reads. The link is taken back
 * again at the end, so the shared demo database is left as it was found.
 */
const BETTINA = 'demo-c-bettina';
const BETTINA_NAME = 'Bettina Roth';

/** The embedded explorer, once the engine has taken the place of the SVG the server sent. */
const map = (page: Page) => page.getByRole('group', { name: 'The people around Lena Brunner' });

test.describe('on a person’s page', () => {
	test.beforeEach(async ({ page }) => {
		await signIn(page);
		await openPerson(page, /Lena Brunner/);
	});

	test('runs the real explorer, without the controls that are about travelling', async ({
		page
	}) => {
		await expect(map(page).locator('canvas').first()).toBeVisible();

		// The toolbar is there — the Filter menu says so — but the two controls for going
		// elsewhere are not: the page has its own search, and the whole map is one person's
		// neighbourhood. Circles are the profile's own list; on a card-sized map they double the
		// node count, so the map opens without them — which is not the reader narrowing it.
		const pill = map(page).getByRole('button', { name: 'Filter: 5 of 6 kinds of line shown' });
		await expect(pill).toBeVisible();
		const menu = await filterMenu(map(page));
		await expect(menu.getByRole('menuitemcheckbox', { name: 'Family' })).toHaveAttribute(
			'aria-checked',
			'true'
		);
		await expect(menu.getByRole('menuitemcheckbox', { name: 'Circles' })).toHaveAttribute(
			'aria-checked',
			'false'
		);
		await page.keyboard.press('Escape');
		await expect(map(page).getByLabel('Find a person')).toHaveCount(0);
		await expect(map(page).getByRole('button', { name: 'Connection path' })).toHaveCount(0);

		// And nothing is selected on arrival: the peek panel would cover half a card-sized map
		// before anybody asked it anything, and the page's header already names the person.
		await expect(map(page).getByRole('complementary')).toHaveCount(0);
	});

	test('a person at the edge of the map is offered the graph, not another hop', async ({
		page
	}) => {
		await expect(map(page).locator('canvas').first()).toBeVisible();
		// The nodes are clicked where the renderer draws them, which is a point in the window:
		// with the card scrolled past, every one of them is off the screen.
		await map(page).scrollIntoViewIfNeeded();
		await settled(page);

		// Somebody one hop out, picked from what the canvas draws in the clear: the toolbar
		// floats over the drawing, and where the layout puts a given person is not this
		// case's business.
		const rings = await ringsOnCanvas(page, LENA);
		const oneHop = [...rings]
			.filter(([id, hops]) => hops === 1 && id.startsWith('demo-c-'))
			.map(([id]) => id);
		const nearby = await firstClickableNode(page, oneHop);
		expect(nearby, `nobody one hop out was clickable: ${JSON.stringify(await nodeOwners(page, oneHop))}`).not.toBeNull();

		await clickNode(page, nearby!);
		const peek = map(page).getByRole('complementary');
		const expand = peek.getByRole('button', { name: 'Expand connections' });
		await expect(expand).toBeVisible();
		await expect(peek.getByRole('link', { name: 'Open in the graph' })).toHaveCount(0);

		await expand.click();
		await settled(page);

		// Whoever that brought along stands two hops from Lena — the edge of what this map
		// promises.
		await peek.getByRole('button', { name: 'Close' }).click();
		await settled(page);
		const grown = await ringsOnCanvas(page, LENA);
		const edge = await firstClickableNode(
			page,
			[...grown].filter(([id, hops]) => hops === 2 && id.startsWith('demo-c-')).map(([id]) => id)
		);
		expect(edge, 'expanding should have reached two hops out').not.toBeNull();

		await clickNode(page, edge!);
		await expect(peek.getByRole('link', { name: 'Open in the graph' })).toBeVisible();
		await expect(peek.getByRole('button', { name: 'Expand connections' })).toHaveCount(0);
		await expect(peek).toContainText('This is as far as this map goes.');
	});

	test('opening a profile from the panel leaves the next page’s map unselected', async ({
		page
	}) => {
		await expect(map(page).locator('canvas').first()).toBeVisible();
		await map(page).scrollIntoViewIfNeeded();
		await settled(page);

		const rings = await ringsOnCanvas(page, LENA);
		const oneHop = [...rings]
			.filter(([id, hops]) => hops === 1 && id.startsWith('demo-c-'))
			.map(([id]) => id);
		const nearby = await firstClickableNode(page, oneHop);
		expect(nearby, `nobody one hop out was clickable: ${JSON.stringify(await nodeOwners(page, oneHop))}`).not.toBeNull();

		await clickNode(page, nearby!);
		await expect(map(page).getByRole('complementary')).toBeVisible();
		await map(page).getByRole('link', { name: 'Open profile' }).click();

		// That person's own page now, with their own map: the panel belonged to the map we
		// left, and an explorer carried over from the previous person would still be showing
		// it — over somebody else's neighbourhood.
		await expect(page).toHaveURL(new RegExp(`/contacts/${nearby}$`));
		const theirs = page.getByRole('group', { name: /^The people around / });
		await expect(theirs.locator('canvas').first()).toBeVisible();
		await settled(page);
		await expect(theirs.getByRole('complementary')).toHaveCount(0);
	});
});

/*
 * The map follows a save (docs/05 §5.8). The explorer used to hold the snapshot it was mounted
 * with, so entering a relationship left the list right and the map a version behind until
 * somebody reloaded the page by hand. Written after the maintainer saw the fix live
 * (docs/08 §8.4.1).
 */
test.describe('when a relationship is entered', () => {
	test.beforeEach(async ({ page }) => {
		await signIn(page);
		await openPerson(page, /Lena Brunner/);
	});

	test('draws the new person into the map, without reloading the page', async ({ page }) => {
		await expect(map(page).locator('canvas').first()).toBeVisible();
		await settled(page);

		// The signal the case is worth anything: she is not on the map to begin with. Several
		// cases borrow her as the household's unlinked person, so say what a failure here
		// means — one of them left a link behind rather than this map being wrong.
		expect(
			await stateOf(page, BETTINA),
			`${BETTINA_NAME} should be linked to nobody: another case has left a link behind`
		).toBe('absent');

		// Survives an in-page update and is wiped by a navigation, so the assertion at the end
		// can tell a redrawn map from a reloaded page.
		await page.evaluate(() => ((window as unknown as { mapStayed: boolean }).mapStayed = true));

		await page.getByRole('button', { name: 'Add relationship' }).click();
		const form = page.locator('form[action="?/addRelationship"]');
		await form.locator('select[name=typeChoice]').selectOption({ label: 'Knows' });
		await pickPerson(form.getByLabel('Person'), BETTINA_NAME);
		await form.getByRole('button', { name: 'Add', exact: true }).click();

		// The list has her…
		await expect(page.locator('#section-relationships ul').first()).toContainText(BETTINA_NAME);
		// …and so does the map: the renderer's own answer for where that node now is.
		await expect.poll(() => stateOf(page, BETTINA)).toBe('drawn');
		await settled(page);

		expect(
			await page.evaluate(() => (window as unknown as { mapStayed?: boolean }).mapStayed),
			'the map should have redrawn in place, not been rebuilt by a page load'
		).toBe(true);
	});

	test.afterEach(async ({ page }) => {
		// Put the household back: take the link away and leave the page, which is what sends a
		// pending removal, then read Lena fresh — the map no longer knows her either.
		await openPerson(page, /Lena Brunner/);
		const row = page
			.locator('#section-relationships ul')
			.first()
			.locator('li')
			.filter({ hasText: BETTINA_NAME });
		if ((await row.count()) === 0) return;
		await row.getByRole('button', { name: `Remove the link to ${BETTINA_NAME}` }).click();
		await expect(page.getByTestId('toast-undo')).toBeVisible();
		await openPerson(page, /Noah Brunner/);

		await openPerson(page, /Lena Brunner/);
		await expect(page.locator('#section-relationships ul').first()).not.toContainText(BETTINA_NAME);
		await expect(map(page).locator('canvas').first()).toBeVisible();
		await settled(page);
		expect(await stateOf(page, BETTINA)).toBe('absent');
	});
});

/*
 * What the page shows before — or without — the ~400 KB engine. The server renders the plain
 * SVG ego graph and the explorer takes its place once it has loaded, so the map is never a
 * blank box waiting on a download, and a browser that never finishes the fetch still shows the
 * relationships (docs/05 §5.8).
 */
test.describe('without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test('still draws the relationships, each name a link to that person', async ({ page }) => {
		await page.goto(`/contacts/${LENA}`);

		const svg = page.getByRole('img', { name: 'Relationship network for Lena Brunner' });
		await expect(svg).toBeVisible();
		await expect(svg.getByRole('link', { name: /Markus Brunner/ })).toHaveAttribute(
			'href',
			`/contacts/${MARKUS}`
		);
		// The interactive map is the part that never arrives here.
		await expect(page.locator('canvas')).toHaveCount(0);
	});
});

import { expect, test, type Page } from '@playwright/test';
import { openPerson, signIn } from './app';
import { clickNode, ringsOnCanvas, settled } from './graph-canvas';

/*
 * The map on a person's page (docs/05 §5.5, §5.8): the same explorer the graph route runs,
 * with a narrower brief — this person stays in the middle, the map reaches two hops, and the
 * toolbar drops what is about travelling the household. Written after the maintainer saw it
 * live (docs/08 §8.4.1).
 */

const LENA = 'demo-c-lena';
/** Lena's father: one hop out, so the map may still grow through him. */
const MARKUS = 'demo-c-markus';

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

		// The toolbar is there — the chips say so — but the two controls for going elsewhere are
		// not: the page has its own search, and the whole map is one person's neighbourhood.
		await expect(map(page).getByRole('button', { name: 'Family' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		// Circles are the profile's own list; on a card-sized map they double the node count.
		await expect(
			map(page).getByRole('button', { name: 'Circles', exact: true })
		).toHaveAttribute('aria-pressed', 'false');
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
		await settled(page);

		await clickNode(page, MARKUS);
		const peek = map(page).getByRole('complementary');
		const expand = peek.getByRole('button', { name: 'Expand connections' });
		await expect(expand).toBeVisible();
		await expect(peek.getByRole('link', { name: 'Open in the graph' })).toHaveCount(0);

		await expand.click();
		await settled(page);

		// Whoever he brought with him stands two hops from Lena — the edge of what this map
		// promises. Read off the canvas rather than named, so the case does not depend on the
		// seed relating any particular pair at any particular distance.
		const rings = await ringsOnCanvas(page, LENA);
		const edge = [...rings].find(([id, hops]) => hops === 2 && id.startsWith('demo-c-'))?.[0];
		expect(edge, 'expanding should have reached two hops out').toBeDefined();

		await peek.getByRole('button', { name: 'Close' }).click();
		await settled(page);
		// Retried the way the explorer's own spec clicks a node: the panel just closed may have
		// been sitting over where this one is drawn, and the click is idempotent.
		await expect(async () => {
			await clickNode(page, edge!);
			await expect(peek.getByRole('link', { name: 'Open in the graph' })).toBeVisible({
				timeout: 1000
			});
		}).toPass();
		await expect(peek.getByRole('button', { name: 'Expand connections' })).toHaveCount(0);
		await expect(peek).toContainText('This is as far as this map goes.');
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

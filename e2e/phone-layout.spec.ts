import { expect, test, type Locator, type Page } from '@playwright/test';
import { signIn } from './app';
import { clickFrame, clickNode, settled } from './graph-canvas';

/*
 * The app on a phone, tuned for a Pixel 9 Pro (docs/05 §5.5, §5.8). Written after the
 * maintainer checked it on the phone itself (docs/08 §8.4.1).
 *
 * Read-only against the demo household. What it asks is geometry — which things share a row,
 * what stays on the screen — so every case measures the rendered page rather than trusting
 * the classes that should produce it.
 */

const PIXEL_9_PRO = { width: 412, height: 915 };
/** The room an open menu keeps from the edge of the map (docs/05 §5.8). */
const EDGE_MARGIN = 12;
const LENA = 'demo-c-lena';
const TURNVEREIN = 'demo-circle-turnverein';
const AKTIVE = `rolegroup:${TURNVEREIN}:=Aktive`;

test.use({ viewport: PIXEL_9_PRO, hasTouch: true });

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

async function boxOf(locator: Locator) {
	const box = await locator.boundingBox();
	if (!box) throw new Error(`${locator} has no layout`);
	return box;
}

/** The tab bar along the foot of a phone's screen. */
const tabBar = (page: Page) =>
	page.getByRole('navigation').filter({ has: page.getByRole('link', { name: 'Circles' }) });

/** Asserts the panel is a strip along the bottom of the map, the tab bar covering none of it. */
async function expectBottomStrip(page: Page, panel: Locator) {
	const strip = await boxOf(panel);
	const bar = await boxOf(tabBar(page));
	const search = await boxOf(page.getByLabel('Find a person'));
	// Spanning the width, not a side panel over half of it.
	expect(strip.width).toBeGreaterThan(PIXEL_9_PRO.width * 0.9);
	expect(strip.y + strip.height).toBeLessThanOrEqual(bar.y);
	// And clear of the toolbar, which stays within reach while somebody is selected.
	expect(strip.y).toBeGreaterThan(search.y + search.height);
}

test('the map’s search, Filter and Arrange share one row, By circle included', async ({
	page
}) => {
	await page.goto(`/graph?center=${LENA}`);
	await settled(page);
	const arrange = page.getByRole('button', { name: /^Arrange:/ });

	for (const choice of ['Free', 'By circle']) {
		if (choice !== 'Free') {
			await arrange.click();
			await page.getByRole('menuitemradio', { name: new RegExp(`^${choice}`) }).click();
			await settled(page);
		}
		const row = await Promise.all(
			[page.getByLabel('Find a person'), page.getByRole('button', { name: /^Filter/ }), arrange].map(
				boxOf
			)
		);
		const middles = row.map((b) => b.y + b.height / 2);
		expect(Math.max(...middles) - Math.min(...middles), `${choice}: not one row`).toBeLessThan(8);
		expect(Math.max(...row.map((b) => b.x + b.width))).toBeLessThanOrEqual(PIXEL_9_PRO.width);
	}
});

test('an open Filter or Arrange menu stays on the map', async ({ page }) => {
	await page.goto(`/graph?center=${LENA}`);
	await settled(page);

	for (const pill of [/^Filter/, /^Arrange:/]) {
		await page.getByRole('button', { name: pill }).click();
		const menu = await boxOf(page.getByRole('menu'));
		expect(menu.x, `${pill} menu runs off the left`).toBeGreaterThanOrEqual(EDGE_MARGIN - 1);
		expect(menu.x + menu.width, `${pill} menu runs off the right`).toBeLessThanOrEqual(
			PIXEL_9_PRO.width - EDGE_MARGIN + 1
		);
		await page.keyboard.press('Escape');
		await expect(page.getByRole('menu')).toHaveCount(0);
	}
});

test('a selected person’s panel is a strip along the bottom, above the tab bar', async ({
	page
}) => {
	await page.goto(`/graph?center=${LENA}`);
	await settled(page);

	// The centre is selected on arrival, so its panel is showing. Every link of hers is drawn
	// already, so it offers no Expand and says why — on a phone too (docs/02 §2.7).
	const panel = page.getByRole('complementary').filter({ hasText: 'Lena Brunner' });
	await expect(panel.getByRole('link', { name: 'Open profile' })).toBeVisible();
	await expect(panel).toContainText('Everything linked here is already on the map.');
	await expect(panel.getByRole('button', { name: 'Expand connections' })).toHaveCount(0);
	await expectBottomStrip(page, panel);

	// A node with more around it — her Turnverein, its members unopened — offers both, side by
	// side, not stacked.
	await panel.getByRole('button', { name: 'Close' }).click();
	await clickNode(page, TURNVEREIN);
	const circle = page.getByRole('complementary').filter({ hasText: 'Turnverein Länggasse' });
	await expectBottomStrip(page, circle);
	const expand = await boxOf(circle.getByRole('button', { name: 'Expand connections' }));
	const open = await boxOf(circle.getByRole('link', { name: 'Open the circle' }));
	expect(Math.abs(expand.y - open.y)).toBeLessThan(2);
});

test('a tapped role group’s panel is the same strip', async ({ page }) => {
	await page.addInitScript(() => localStorage.setItem('stella.graph.groupByRole', 'on'));
	await page.goto(`/graph?center=${TURNVEREIN}`);
	await settled(page);
	// The circle, selected on arrival, has its own strip over the foot of the map; closed, the
	// group beneath it can be tapped.
	await page
		.getByRole('complementary')
		.filter({ hasText: 'Turnverein Länggasse' })
		.getByRole('button', { name: 'Close' })
		.click();

	await clickFrame(page, AKTIVE);

	const panel = page.getByTestId('group-peek');
	await expect(panel.getByText('Aktive · 2')).toBeVisible();
	await expectBottomStrip(page, panel);
});

test('the relationships card keeps its title and its three controls on one row', async ({ page }) => {
	await page.goto(`/contacts/${LENA}`);
	const header = page.locator('section[id*="relationships"] header').first();
	const [title, edit, add, more] = await Promise.all(
		[
			header.getByRole('heading', { name: 'People' }),
			header.getByRole('button', { name: 'Edit' }),
			header.getByRole('button', { name: 'Add relationship' }),
			header.getByRole('button', { name: 'More for these relationships' })
		].map(boxOf)
	);

	// One row: the four would otherwise wrap into a grid of their own under the title.
	for (const control of [edit, add, more]) {
		expect(Math.abs(control.y + control.height / 2 - (title.y + title.height / 2))).toBeLessThan(4);
	}
	// In reading order, and the last one inside the screen.
	expect(edit.x).toBeLessThan(add.x);
	expect(add.x).toBeLessThan(more.x);
	expect(more.x + more.width).toBeLessThanOrEqual(PIXEL_9_PRO.width);
});

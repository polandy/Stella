import { expect, test, type Locator, type Page } from '@playwright/test';
import { signIn } from './app';
import { clickFrame, settled } from './graph-canvas';

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

	// The centre is selected on arrival, so its panel is showing.
	const panel = page.getByRole('complementary').filter({ hasText: 'Lena Brunner' });
	await expect(panel.getByRole('link', { name: 'Open profile' })).toBeVisible();
	await expectBottomStrip(page, panel);

	// Its two buttons side by side, not stacked.
	const expand = await boxOf(panel.getByRole('button', { name: 'Expand connections' }));
	const profile = await boxOf(panel.getByRole('link', { name: 'Open profile' }));
	expect(Math.abs(expand.y - profile.y)).toBeLessThan(2);
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

test('the relationships card lays its four actions out as an even grid', async ({ page }) => {
	await page.goto(`/contacts/${LENA}`);
	const header = page.locator('section[id*="relationships"] header').first();
	const actions = await Promise.all(
		[
			header.getByRole('button', { name: 'How are we connected?' }),
			header.getByRole('link', { name: 'Open in the graph' }),
			header.getByRole('link', { name: 'Check relationships' }),
			header.getByRole('button', { name: 'Add relationship' })
		].map(boxOf)
	);
	const [connected, graph, check, add] = actions;

	// Two to a row, the columns lined up, every button as wide as the next.
	expect(Math.abs(connected.y - graph.y)).toBeLessThan(2);
	expect(Math.abs(check.y - add.y)).toBeLessThan(2);
	expect(check.y).toBeGreaterThan(connected.y);
	expect(Math.abs(connected.x - check.x)).toBeLessThan(2);
	expect(Math.abs(graph.x - add.x)).toBeLessThan(2);
	const widths = actions.map((b) => b.width);
	expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(2);
});

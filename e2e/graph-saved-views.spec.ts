import { expect, test, type Locator, type Page } from '@playwright/test';
import { signIn } from './app';
import { filterMenu } from './graph-canvas';

/*
 * The Filter menu's saved views, its near-miss tolerance and its phone-sized line-kind chips
 * (docs/02 §2.7, docs/05 §5.8). Written after the owner tried them in the running app
 * (docs/08 §8.4.1).
 *
 * Saved views live in this device's storage; each test gets a fresh browser context, so every
 * test starts with none.
 */

const PIXEL_9_PRO = { width: 412, height: 915 };
const KINDS = ['Family', 'Romantic', 'Social', 'Work', 'Circles', 'Kinship'];

async function openGraph(page: Page): Promise<void> {
	await signIn(page);
	await page.goto('/graph?center=demo-c-hans');
	await expect(page.locator('canvas').first()).toBeVisible();
}

const chip = (menu: Locator, name: string) =>
	menu.getByRole('menuitemcheckbox', { name, exact: true });
/** The saved views' own group: the Spacing choice further down is radio items too. */
const views = (menu: Locator) =>
	menu.getByRole('group', { name: 'Saved views' }).getByRole('menuitemradio');
const view = (menu: Locator, name: string) =>
	menu
		.getByRole('group', { name: 'Saved views' })
		.getByRole('menuitemradio', { name, exact: true });

/** Names what the menu shows now through "Save this view…", and waits for the row. */
async function saveView(menu: Locator, name: string): Promise<void> {
	await menu.getByRole('menuitem', { name: 'Save this view…' }).click();
	await menu.getByLabel('Name of the view').fill(name);
	await menu.getByRole('menuitem', { name: 'Save', exact: true }).click();
	await expect(view(menu, name)).toBeVisible();
}

test('a view is saved, ticked while it matches, applied, replaced, deleted and kept across a reload', async ({
	page
}) => {
	await openGraph(page);
	let menu = await filterMenu(page);
	await expect(views(menu)).toHaveCount(0);

	// Saved with Family off, the new view is the one the map shows.
	await chip(menu, 'Family').click();
	await expect(chip(menu, 'Family')).toHaveAttribute('aria-checked', 'false');
	await saveView(menu, 'No family');
	await expect(view(menu, 'No family')).toHaveAttribute('aria-checked', 'true');

	// Turning Family back on leaves the view behind, so its tick goes.
	await chip(menu, 'Family').click();
	await expect(chip(menu, 'Family')).toHaveAttribute('aria-checked', 'true');
	await expect(view(menu, 'No family')).toHaveAttribute('aria-checked', 'false');

	// Applying it ends the choice: the menu closes on the map it now shows.
	await view(menu, 'No family').click();
	await expect(page.getByRole('menu', { name: /^Filter/ })).toHaveCount(0);
	await expect(
		page.getByRole('button', { name: 'Filter: 5 of 6 kinds of line shown' })
	).toBeVisible();
	menu = await filterMenu(page);
	await expect(chip(menu, 'Family')).toHaveAttribute('aria-checked', 'false');
	await expect(view(menu, 'No family')).toHaveAttribute('aria-checked', 'true');

	// Saving again under the same name replaces the view rather than adding a second one.
	await chip(menu, 'Romantic').click();
	await expect(view(menu, 'No family')).toHaveAttribute('aria-checked', 'false');
	await menu.getByRole('menuitem', { name: 'Save this view…' }).click();
	await menu.getByLabel('Name of the view').fill('No family');
	await expect(menu.getByText('Replaces “No family”')).toBeVisible();
	await menu.getByRole('menuitem', { name: 'Save', exact: true }).click();
	await expect(menu.getByRole('menuitem', { name: 'Save this view…' })).toBeVisible();
	await expect(views(menu)).toHaveCount(1);
	await expect(view(menu, 'No family')).toHaveAttribute('aria-checked', 'true');

	// A second view, then deleting the first leaves the second alone.
	await chip(menu, 'Family').click();
	await chip(menu, 'Romantic').click();
	await saveView(menu, 'Everything');
	await expect(views(menu)).toHaveCount(2);
	await menu.getByRole('menuitem', { name: 'Delete the view “No family”' }).click();
	await expect(views(menu)).toHaveCount(1);
	await expect(view(menu, 'Everything')).toBeVisible();

	// The device keeps them: after a reload the list is the one left behind.
	await page.reload();
	await expect(page.locator('canvas').first()).toBeVisible();
	menu = await filterMenu(page);
	await expect(view(menu, 'Everything')).toBeVisible();
	await expect(views(menu)).toHaveCount(1);
});

test.describe('on a phone', () => {
	test.use({ viewport: PIXEL_9_PRO, hasTouch: true, isMobile: true });

	test('a tap just outside the Filter menu leaves it open, one well outside closes it', async ({
		page
	}) => {
		await openGraph(page);
		const menu = await filterMenu(page);
		const box = await menu.boundingBox();
		if (!box) throw new Error('the Filter menu has no layout');
		const x = box.x + box.width / 2;
		const below = box.y + box.height;
		const viewport = page.viewportSize();
		if (!viewport || below + 120 > viewport.height)
			throw new Error('no room below the Filter menu to tap');

		// A thumb that missed the edge: the menu stays. Toggling a chip afterwards is the positive
		// signal — taps are handled in order, so the near miss was handled before it. 12px out
		// rather than a hair: Chromium's own touch adjustment already snaps a tap a few pixels
		// off the edge onto the menu, so a closer tap would pass without the menu's help.
		await page.touchscreen.tap(x, below + 12);
		await chip(menu, 'Family').tap();
		await expect(chip(menu, 'Family')).toHaveAttribute('aria-checked', 'false');
		await expect(menu).toBeVisible();

		// Well outside, it closes.
		await page.touchscreen.tap(x, below + 100);
		await expect(page.getByRole('menu', { name: /^Filter/ })).toHaveCount(0);
	});

	test('the line-kind chips are a full fingertip tall', async ({ page }) => {
		await openGraph(page);
		expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
		const menu = await filterMenu(page);
		for (const kind of KINDS) {
			const box = await chip(menu, kind).boundingBox();
			if (!box) throw new Error(`the ${kind} chip has no layout`);
			expect(box.height, kind).toBeGreaterThanOrEqual(44);
		}
	});
});

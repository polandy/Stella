import { expect, test, type Page } from '@playwright/test';
import { signIn } from './app';
import { arrangeBy, arrangement, filterMenu, linesShownBetween, settled } from './graph-canvas';

/*
 * A filter in the family tree only takes lines away (docs/dev/05 §5.8): the people stand where
 * every link among them puts them, whether a kind of line was switched off before the tree was
 * laid out or not — a couple stays together with their line hidden, and a "+N" badge a filter
 * takes away leaves its person's room as it was.
 */

const LENA = 'demo-c-lena';
const [HANS, ROSA] = ['hans', 'rosa'].map((k) => `demo-c-${k}`);

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

async function lenasMap(page: Page) {
	await page.goto(`/graph?center=${LENA}`);
	await expect(page.locator('canvas').first()).toBeVisible();
	await settled(page);
}

async function asTree(page: Page) {
	await arrangeBy(page, 'Tree');
	await settled(page);
	return arrangement(page);
}

test('a kind of line switched off before the tree is laid out moves nobody in it', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await lenasMap(page);
	const unfiltered = await asTree(page);
	expect(await linesShownBetween(page, HANS, ROSA)).toBeGreaterThan(0);

	await lenasMap(page);
	const menu = await filterMenu(page);
	const romantic = menu.getByRole('menuitemcheckbox', { name: 'Romantic', exact: true });
	await romantic.click();
	await expect(romantic).toHaveAttribute('aria-checked', 'false');
	await page.keyboard.press('Escape');
	await expect.poll(() => linesShownBetween(page, HANS, ROSA)).toBe(0);
	const filtered = await asTree(page);

	expect(filtered.size).toBe(unfiltered.size);
	for (const [id, at] of unfiltered) expect(filtered.get(id), id).toEqual(at);
});

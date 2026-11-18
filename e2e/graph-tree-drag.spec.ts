import { expect, test, type Page } from '@playwright/test';
import { signIn } from './app';
import { arrangeBy, arrangement, drawnNode, settled } from './graph-canvas';

/*
 * Dragging in the family tree (docs/dev/05 §5.8): the person keeps to their row, snaps into it
 * with their partner on the drop, the tree is laid out again, and the order is kept on this
 * device for the tree around the same centre.
 */

const LENA = 'demo-c-lena';
const [HANS, ROSA, PETER, URSULA] = ['hans', 'rosa', 'peter', 'ursula'].map((k) => `demo-c-${k}`);

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

async function lenasTree(page: Page) {
	await page.goto(`/graph?center=${LENA}`);
	await expect(page.locator('canvas').first()).toBeVisible();
	await settled(page);
	await arrangeBy(page, 'Tree');
	await settled(page);
}

/** Drags `id` by `dx` screen pixels sideways and `dy` down, in steps as a hand would. */
async function drag(page: Page, id: string, dx: number, dy: number) {
	const { point } = await drawnNode(page, id);
	if (!point) throw new Error(`${id} is not drawn`);
	await page.mouse.move(point.x, point.y);
	await page.mouse.down();
	await page.mouse.move(point.x + dx, point.y + dy, { steps: 12 });
	await page.mouse.up();
}

test('a person dragged in the tree snaps into their row with their partner, and the order is kept', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await lenasTree(page);
	const before = await arrangement(page);
	const x = (at: typeof before, id: string) => at.get(id)!.x;
	expect(x(before, HANS)).toBeLessThan(x(before, PETER));

	const { point: hans } = await drawnNode(page, HANS);
	const { point: peter } = await drawnNode(page, PETER);
	await drag(page, PETER, hans!.x - peter!.x - 60, 40);
	await settled(page);

	const after = await arrangement(page);
	expect(after.get(PETER)!.y).toBe(before.get(PETER)!.y);
	expect(x(after, PETER)).toBeLessThan(x(after, HANS));
	expect(x(after, URSULA)).toBeLessThan(x(after, HANS));
	expect(x(after, HANS)).toBeLessThan(x(after, ROSA));

	// Kept on this device for Lena's tree.
	await lenasTree(page);
	const again = await arrangement(page);
	expect(x(again, PETER)).toBeLessThan(x(again, HANS));
});

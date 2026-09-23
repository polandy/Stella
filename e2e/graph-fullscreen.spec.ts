import { expect, test } from '@playwright/test';
import { signIn } from './app';

/*
 * The graph's full screen on a touch device (docs/05 §5.8): an app-level overlay rather than
 * the browser's own Fullscreen API, because iPadOS/iOS Safari reads a downward drag inside a
 * real Fullscreen-API element as "swipe to dismiss" — the same gesture that closes a full-screen
 * video — and panning the canvas is exactly that drag. What a touch context here can prove: the
 * overlay covers the whole viewport, and nothing but its own button removes it. Safari's native
 * dismiss gesture, and the desktop Fullscreen API path, are not something this runner can
 * exercise either way — written after the fix was seen working on the owner's own iPad.
 */
test.use({ hasTouch: true });

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('full screen on touch is an app overlay covering the viewport, and only the button leaves it', async ({
	page
}) => {
	await page.goto('/graph?center=demo-c-hans');
	const canvas = page.locator('canvas').first();
	await expect(canvas).toBeVisible();

	await page.getByRole('button', { name: 'Full screen' }).click();

	const overlay = page.getByRole('dialog');
	await expect(overlay).toBeVisible();
	const box = await overlay.boundingBox();
	const viewport = page.viewportSize();
	if (!box || !viewport) throw new Error('the full screen overlay has no layout');
	expect(box).toEqual({ x: 0, y: 0, width: viewport.width, height: viewport.height });

	// Panning is a drag across the canvas — the very gesture Safari's native full screen would
	// read as "leave". The app-level overlay has nothing tying it to pointer activity, so a pan
	// must not clear it.
	const canvasBox = await canvas.boundingBox();
	if (!canvasBox) throw new Error('the canvas has no layout');
	const startX = canvasBox.x + canvasBox.width / 2;
	const startY = canvasBox.y + canvasBox.height / 3;
	await page.mouse.move(startX, startY);
	await page.mouse.down();
	await page.mouse.move(startX, startY + canvasBox.height / 2, { steps: 8 });
	await page.mouse.up();
	await expect(overlay).toBeVisible();

	await page.getByRole('button', { name: 'Leave full screen' }).click();
	await expect(page.getByRole('dialog')).toHaveCount(0);
});

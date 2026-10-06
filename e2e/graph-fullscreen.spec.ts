import { devices, expect, test } from '@playwright/test';
import { signIn } from './app';
import { settled } from './graph-canvas';

/*
 * The graph's full screen on a touch device (docs/05 §5.8): an app-level overlay rather than
 * the browser's own Fullscreen API, because iPadOS/iOS Safari reads a downward drag inside a
 * real Fullscreen-API element as "swipe to dismiss" — the same gesture that closes a full-screen
 * video — and panning the canvas is exactly that drag. What a touch context here can prove: the
 * overlay covers the whole viewport, and nothing but its own button removes it. Safari's native
 * dismiss gesture, and the desktop Fullscreen API path, are not something this runner can
 * exercise either way — written after the fix was seen working on the owner's own iPad.
 *
 * The app keys the overlay off the device (iPad/iPhone user agent, or a "Mac" with touch points
 * — iPadOS's own disguise), not off touch capability in general, since Android has no such
 * dismiss-gesture quirk. `hasTouch` alone would no longer pick the overlay path here, so this
 * borrows Playwright's iPad user agent string too.
 */
test.use({ hasTouch: true, userAgent: devices['iPad Pro 11'].userAgent });

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

/*
 * The embedded map on a person's page always has a real page behind it (unlike the /graph
 * route, which has nothing to scroll behind it). The scroll lock used to target
 * `document.body`, which is never the app's own scroller (the shell root is already
 * `h-screen overflow-hidden`; the real one is an inner div) — a no-op that let a touch drag
 * over the peek panel scroll-chain to the real page behind the overlay. Checked directly by
 * reading the same ancestor the app itself locks — the actual gesture is Safari's own, and not
 * something this runner can reproduce (see the header comment above) — so the case proves the
 * lock lands on the right element rather than trying to simulate the chaining itself.
 */
test('touch full screen locks the page’s real scroll container, not document.body', async ({
	page
}) => {
	await page.goto('/contacts/demo-c-lena');
	const map = page.getByRole('group', { name: 'The people around Lena Brunner' });
	await expect(map.locator('canvas').first()).toBeVisible();
	await map.scrollIntoViewIfNeeded();
	await settled(page);

	// Found by "has more content than it shows" rather than by its overflow-y value: the lock
	// itself sets that to `hidden`, which would make the element that owns it unrecognisable to
	// a check that went looking for `auto`/`scroll` after the very thing it is verifying.
	const lockState = () =>
		page.evaluate(() => {
			const el: HTMLElement | null = document.querySelector('canvas');
			for (let node = el?.parentElement ?? null; node; node = node.parentElement) {
				if (node.scrollHeight > node.clientHeight) {
					return {
						scrollerLocked: getComputedStyle(node).overflow === 'hidden',
						bodyLocked: getComputedStyle(document.body).overflow === 'hidden'
					};
				}
			}
			return null;
		});

	expect(await lockState()).toEqual({ scrollerLocked: false, bodyLocked: false });

	await map.getByRole('button', { name: 'Full screen' }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
	expect(await lockState()).toEqual({ scrollerLocked: true, bodyLocked: false });

	await page.getByRole('button', { name: 'Leave full screen' }).click();
	await expect(page.getByRole('dialog')).toHaveCount(0);
	expect(await lockState()).toEqual({ scrollerLocked: false, bodyLocked: false });
});

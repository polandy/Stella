import { expect, test, type Locator, type Page } from '@playwright/test';
import { enlargeMap, signIn } from './app';
import { arrangeBy, settled } from './graph-canvas';

/*
 * Entering or leaving full screen frames the map afresh for its new size — unless the reader has
 * panned or zoomed since the map last framed itself, then their view is kept (docs/05 §5.8).
 * Desktop Chromium, so this is the browser's own Fullscreen API.
 *
 * The canvas re-measures its container only once the container has settled (Cytoscape's own
 * resize observer), and the reframe follows from that measurement at once, or once a glide still
 * under way has come to rest. So each case waits for the renderer to report the size the
 * container ends at and for the canvas to be at rest, and then reads the view: a reframe that was
 * going to happen has happened by then, and one that was not never will.
 */

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

/** The renderer's view right now, read off the instance Cytoscape registers on its container. */
interface View {
	zoom: number;
	pan: { x: number; y: number };
	/** The size the renderer last measured its container at. */
	measured: { width: number; height: number };
	/** The container's own size in the page. */
	container: { width: number; height: number };
	/** The drawn map's box, in canvas pixels. */
	map: { x1: number; y1: number; x2: number; y2: number };
}

async function viewOf(page: Page): Promise<View> {
	return page.evaluate(() => {
		type Box = { x1: number; y1: number; x2: number; y2: number };
		type Core = {
			zoom(): number;
			pan(): { x: number; y: number };
			width(): number;
			height(): number;
			nodes(selector: string): { renderedBoundingBox(o: object): Box };
		};
		let el: HTMLElement | null = document.querySelector('canvas');
		while (el && !('_cyreg' in el)) el = el.parentElement;
		const cy = (el as unknown as { _cyreg: { cy: Core } })._cyreg.cy;
		const map = cy.nodes(':visible').renderedBoundingBox({ includeLabels: false });
		return {
			zoom: cy.zoom(),
			pan: { ...cy.pan() },
			measured: { width: cy.width(), height: cy.height() },
			container: { width: el!.clientWidth, height: el!.clientHeight },
			map: { x1: map.x1, y1: map.y1, x2: map.x2, y2: map.y2 }
		};
	});
}

/**
 * Waits until the renderer has measured its container at `size`, and the canvas has come to
 * rest. The container can take a new size in steps — leaving full screen, the width before the
 * height — so the case names the size it ends at rather than taking the first change.
 */
async function measuredAt(page: Page, size: { width: number; height: number }): Promise<View> {
	await expect.poll(async () => (await viewOf(page)).measured).toEqual(size);
	await settled(page);
	return viewOf(page);
}

/** The whole window: what a frame in full screen fills. */
function fullScreenSize(page: Page) {
	const size = page.viewportSize();
	if (!size) throw new Error('the page has no viewport size');
	return size;
}

/** Whether the whole map is drawn inside the canvas. */
const fitsInside = (view: View) =>
	view.map.x1 >= 0 &&
	view.map.y1 >= 0 &&
	view.map.x2 <= view.measured.width &&
	view.map.y2 <= view.measured.height;

async function toggleFullscreen(scope: Page | Locator, on: boolean) {
	await scope.getByRole('button', { name: on ? 'Full screen' : 'Leave full screen' }).click();
}

async function openGraph(page: Page): Promise<View> {
	await page.goto('/graph?center=demo-c-hans');
	await expect(page.locator('canvas').first()).toBeVisible();
	await settled(page);
	return viewOf(page);
}

/** The reader zooms in with the wheel over the middle of the canvas. */
async function zoomByWheel(page: Page) {
	const box = await page.locator('[data-layout]').boundingBox();
	if (!box) throw new Error('the canvas has no layout');
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	const before = (await viewOf(page)).zoom;
	await page.mouse.wheel(0, -300);
	await expect.poll(async () => (await viewOf(page)).zoom).toBeGreaterThan(before);
}

test('an untouched map is framed afresh on entering and on leaving full screen', async ({
	page
}) => {
	const windowed = await openGraph(page);

	await toggleFullscreen(page, true);
	const full = await measuredAt(page, fullScreenSize(page));
	// The bigger room is used: the map is drawn larger, and all of it is on screen.
	expect(full.zoom).toBeGreaterThan(windowed.zoom);
	expect(fitsInside(full)).toBe(true);

	await toggleFullscreen(page, false);
	const back = await measuredAt(page, windowed.measured);
	expect(back.zoom).toBeLessThan(full.zoom);
	expect(fitsInside(back)).toBe(true);
});

test('a map the reader has zoomed keeps their view in and out of full screen', async ({ page }) => {
	await openGraph(page);
	await zoomByWheel(page);
	const zoomed = await viewOf(page);

	await toggleFullscreen(page, true);
	const full = await measuredAt(page, fullScreenSize(page));
	expect(full.zoom).toBe(zoomed.zoom);
	expect(full.pan).toEqual(zoomed.pan);

	await toggleFullscreen(page, false);
	const back = await measuredAt(page, zoomed.measured);
	expect(back.zoom).toBe(zoomed.zoom);
	expect(back.pan).toEqual(zoomed.pan);
});

test('arranging the map again hands the view back to it, so full screen frames it afresh', async ({
	page
}) => {
	await openGraph(page);
	await zoomByWheel(page);
	await arrangeBy(page, 'Free');
	await settled(page);
	const arranged = await viewOf(page);

	await toggleFullscreen(page, true);
	const full = await measuredAt(page, fullScreenSize(page));
	expect(full.zoom).toBeGreaterThan(arranged.zoom);
	expect(fitsInside(full)).toBe(true);
});

test('the enlarged map on a person’s page is framed afresh for full screen', async ({ page }) => {
	await page.goto('/contacts/demo-c-lena');
	await enlargeMap(page);
	const map = page.getByTestId('person-map-enlarged');
	await expect(map.locator('canvas').first()).toBeVisible();
	await settled(page);
	const enlarged = await viewOf(page);

	await toggleFullscreen(map, true);
	const full = await measuredAt(page, fullScreenSize(page));
	expect(full.zoom).toBeGreaterThan(enlarged.zoom);
	expect(fitsInside(full)).toBe(true);
});

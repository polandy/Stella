import { expect, test, type Locator, type Page } from '@playwright/test';
import { signIn } from './app';

/*
 * A phone's top bar slides away while the page scrolls down and comes back as it scrolls up
 * (docs/05 §5.4); the desktop keeps it. Written after the maintainer tried it on the phone
 * (docs/08 §8.4.1). The thresholds are `top-bar.test.ts`'s; this asks what the screen does.
 *
 * Read-only against the demo household, whose Home stream is long enough to scroll.
 */

const PIXEL_9_PRO = { width: 412, height: 915 };

const topBar = (page: Page) => page.getByTestId('top-bar');

/** Where the bar's foot sits once its slide has finished — measured, not read from classes. */
async function settledBottom(bar: Locator): Promise<number> {
	return bar.evaluate(async (element) => {
		await Promise.all(element.getAnimations().map((animation) => animation.finished));
		return element.getBoundingClientRect().bottom;
	});
}

/** Scrolls the page content by `dy`, the way a wheel or a flick does. */
async function scrollBy(page: Page, dy: number): Promise<void> {
	const viewport = page.viewportSize()!;
	await page.mouse.move(viewport.width / 2, viewport.height / 2);
	await page.mouse.wheel(0, dy);
}

test.describe('on a phone', () => {
	test.use({ viewport: PIXEL_9_PRO, hasTouch: true });

	test('slides the top bar away while scrolling down and brings it back on the way up', async ({ page }) => {
		await signIn(page);
		expect(await settledBottom(topBar(page))).toBeGreaterThan(0);

		await scrollBy(page, 600);
		await expect(topBar(page)).toHaveAttribute('data-hidden', 'true');
		expect(await settledBottom(topBar(page))).toBeLessThanOrEqual(0);

		await scrollBy(page, -60);
		await expect(topBar(page)).toHaveAttribute('data-hidden', 'false');
		expect(await settledBottom(topBar(page))).toBeGreaterThan(0);
		await expect(page.getByRole('button', { name: 'Search' })).toBeInViewport();
	});
});

test('keeps the top bar on a desktop while scrolling down', async ({ page }) => {
	await signIn(page);

	await scrollBy(page, 600);
	// The rule has seen the scroll — the positive signal — and only the phone acts on it.
	await expect(topBar(page)).toHaveAttribute('data-hidden', 'true');
	expect(await settledBottom(topBar(page))).toBeGreaterThan(0);
	await expect(page.getByRole('button', { name: 'Search' })).toBeInViewport();
});

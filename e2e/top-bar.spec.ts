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


/**
 * Moves the page content to `top` (or its very end) and waits until the shell has finished
 * answering: the scroll event has fired, and the bar has no slide left running — including any
 * slide a further scroll event set off while the scroller changed size under it. The scroll is
 * set directly rather than wheeled, so it lands exactly where the case needs it in one event.
 */
async function scrollContentTo(page: Page, top: number | 'end'): Promise<void> {
	await page.evaluate(async (top) => {
		const scroller = document.getElementById('content')!;
		const bar = document.querySelector<HTMLElement>('[data-testid=top-bar]')!;
		const maxY = scroller.scrollHeight - scroller.clientHeight;
		const target = top === 'end' ? maxY : Math.min(top, maxY);
		if (Math.round(target) === Math.round(scroller.scrollTop)) throw new Error(`Already at ${target}: no scroll event would fire.`);
		const scrolled = new Promise((resolve) => scroller.addEventListener('scroll', resolve, { once: true }));
		scroller.scrollTop = target;
		await scrolled;
		const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
		// A slide starts on the frame after the state changed; wait for every one in turn.
		for (;;) {
			await frame();
			const slides = bar.getAnimations();
			if (slides.length === 0) return;
			await Promise.allSettled(slides.map((slide) => slide.finished));
		}
	}, top);
}

/** Starts recording every value the bar's `data-hidden` takes from now on. */
async function recordFlips(page: Page): Promise<() => Promise<string[]>> {
	await page.evaluate(() => {
		const bar = document.querySelector('[data-testid=top-bar]')!;
		const flips: string[] = [];
		(window as unknown as { topBarFlips: string[] }).topBarFlips = flips;
		new MutationObserver(() => flips.push(bar.getAttribute('data-hidden')!)).observe(bar, {
			attributes: true,
			attributeFilter: ['data-hidden']
		});
	});
	return () => page.evaluate(() => [...(window as unknown as { topBarFlips: string[] }).topBarFlips]);
}

/** How far the content scrolls, and how far it is now. */
const scrollPosition = (page: Page) =>
	page.evaluate(() => {
		const scroller = document.getElementById('content')!;
		return { y: scroller.scrollTop, maxY: scroller.scrollHeight - scroller.clientHeight };
	});

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
		// Home on a phone has no search button (its field is the search); *Add person* is there.
		await expect(page.getByRole('banner').getByRole('link', { name: 'Add person' })).toBeInViewport();
	});

	test('keeps the top bar still at the bottom of a page, and brings it back on the way out', async ({ page }) => {
		await signIn(page);
		const barHeight = await topBar(page).evaluate((bar) => bar.getBoundingClientRect().height);
		expect(barHeight).toBeGreaterThan(24);
		const { maxY } = await scrollPosition(page);
		// Long enough for a middle that is clear of both the top and the bottom.
		expect(maxY).toBeGreaterThan(8 * barHeight);

		// Down the page: the bar slides away, and then on to the very end.
		await scrollContentTo(page, Math.round(maxY / 2));
		await expect(topBar(page)).toHaveAttribute('data-hidden', 'true');
		await scrollContentTo(page, 'end');
		await expect(topBar(page)).toHaveAttribute('data-hidden', 'true');

		// A thumb working at the end of the page: a little up, back down to the end, twice. Each
		// step is a scroll the shell has answered and settled, so whatever the bar did is recorded.
		const flips = await recordFlips(page);
		for (let round = 0; round < 2; round++) {
			const { y } = await scrollPosition(page);
			await scrollContentTo(page, y - 30);
			await scrollContentTo(page, 'end');
		}
		expect(await flips()).toEqual([]);
		await expect(topBar(page)).toHaveAttribute('data-hidden', 'true');

		// Out of the bottom zone, on the way up, the bar comes back.
		const { y } = await scrollPosition(page);
		await scrollContentTo(page, y - 4 * barHeight);
		await expect(topBar(page)).toHaveAttribute('data-hidden', 'false');
		expect(await flips()).toEqual(['false']);
		expect(await settledBottom(topBar(page))).toBeGreaterThan(0);
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

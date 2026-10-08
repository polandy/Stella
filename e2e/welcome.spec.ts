import { expect, test, type Locator, type Page } from '@playwright/test';
import { WELCOME_EXIT } from '../src/lib/motion/welcome';

/*
 * The welcome on start (docs/05 §5.11.4): once per session the constellation comes together and
 * docks into the visible logo, or fades in place where there is none. Written after the owner
 * tried it on the phone and the desktop (docs/08 §8.4.1).
 *
 * Every context here is fresh, so its first page is a cold start. The overlay plays from the
 * first paint, before any test step could catch it, so an init script holds its animations
 * paused from the start and each test moves the timeline itself (`currentTime`, `finish()`):
 * nothing waits on how long the welcome takes, and a slow machine cannot run it out early.
 * Read-only against the demo household.
 */

const PIXEL_9_PRO = { width: 412, height: 915 };

const overlay = (page: Page) => page.locator('#stella-welcome');

/** Holds the welcome's CSS animations at their start until the test moves them. */
async function holdTheWelcome(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const sheet = new CSSStyleSheet();
		sheet.replaceSync(
			'#stella-welcome, #stella-welcome * { animation-play-state: paused !important; }'
		);
		document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
	});
}

/**
 * Plays the build-up to the moment the exit starts: the constellation and the wordmark are
 * complete and the exit cue fires, so the overlay picks its exit.
 */
async function reachTheExit(page: Page): Promise<void> {
	await expect(overlay(page)).toBeAttached();
	await page.evaluate((startMs) => {
		for (const animation of document.getAnimations()) {
			if (!(animation instanceof CSSAnimation)) continue;
			if (animation.animationName === 'welcome-cue') animation.finish();
			else if (animation.animationName.startsWith('welcome-')) animation.currentTime = startMs;
		}
	}, WELCOME_EXIT.startMs);
}

/**
 * Plays the dock to its last frame and says where the flying mark and the target logo are,
 * read in the same task, before the landing takes the overlay away.
 */
async function landTheMark(page: Page, logo: Locator) {
	const target = await logo.elementHandle();
	return page.evaluate((target) => {
		for (const animation of document.getAnimations()) {
			if (!(animation instanceof CSSAnimation)) continue;
			if (!['welcome-dock', 'welcome-backdrop', 'welcome-out'].includes(animation.animationName))
				continue;
			const end = animation.effect?.getComputedTiming().endTime;
			animation.currentTime = Number(end);
		}
		const mark = document.querySelector('#stella-welcome svg')!.getBoundingClientRect();
		const box = target!.getBoundingClientRect();
		return {
			dx: mark.left + mark.width / 2 - (box.left + box.width / 2),
			dy: mark.top + mark.height / 2 - (box.top + box.height / 2),
			width: mark.width - box.width
		};
	}, target);
}

/** The welcome docks into `logo`: hidden while it runs, the mark lands on it, then it shows. */
async function expectDockInto(page: Page, logo: Locator): Promise<void> {
	await expect(overlay(page)).toBeVisible();
	await expect(logo).toBeHidden();

	await reachTheExit(page);
	await expect(overlay(page)).toHaveClass('dock');

	const offset = await landTheMark(page, logo);
	expect(Math.abs(offset.dx)).toBeLessThanOrEqual(1);
	expect(Math.abs(offset.dy)).toBeLessThanOrEqual(1);
	expect(Math.abs(offset.width)).toBeLessThanOrEqual(1);

	await expect(overlay(page)).toHaveCount(0);
	await expect(logo).toBeVisible();
}

// The motion is what this file is about, so it runs with motion (playwright.config.ts); the
// reduced-motion case below opts back in to less.
test.use({ contextOptions: { reducedMotion: 'no-preference' } });

test.beforeEach(async ({ page }) => {
	await holdTheWelcome(page);
});

test.describe('signed out', () => {
	test.use({ storageState: { cookies: [], origins: [] } });

	test('docks into the sign-in logo on a first visit', async ({ page }) => {
		await page.goto('/login');
		await expect(page.locator('html')).toHaveAttribute('data-welcome', 'animate');
		await expectDockInto(page, page.locator('[data-welcome-target]'));
	});

	test('shows nothing on a reload in the same tab', async ({ page }) => {
		await page.goto('/login');
		await reachTheExit(page);
		await expect(overlay(page)).toHaveClass('dock');
		await page.evaluate(() => document.getAnimations().forEach((animation) => animation.finish()));
		await expect(overlay(page)).toHaveCount(0);

		await page.reload();
		await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
		await expect(overlay(page)).toHaveCount(0);
		await expect(page.locator('html')).not.toHaveAttribute('data-welcome');
	});

	test('goes at once on a tap, showing the logo', async ({ page }) => {
		await page.goto('/login');
		const logo = page.locator('[data-welcome-target]');
		await expect(overlay(page)).toBeVisible();
		await expect(logo).toBeHidden();

		await page.mouse.click(5, 5);
		await expect(overlay(page)).toHaveCount(0);
		await expect(logo).toBeVisible();
	});

	test('goes at once on a key press, showing the logo', async ({ page }) => {
		await page.goto('/login');
		const logo = page.locator('[data-welcome-target]');
		await expect(overlay(page)).toBeVisible();

		await page.keyboard.press('Shift');
		await expect(overlay(page)).toHaveCount(0);
		await expect(logo).toBeVisible();
	});

	test.describe('with less motion', () => {
		test.use({ contextOptions: { reducedMotion: 'reduce' } });

		test('shows the finished mark still, then goes without docking', async ({ page }) => {
			await page.goto('/login');
			await expect(page.locator('html')).toHaveAttribute('data-welcome', 'still');
			await expect(overlay(page)).toBeVisible();

			// Nothing inside it moves: the mark is drawn finished, at its own place.
			const moving = await overlay(page).evaluate(
				(element) => element.querySelector('svg')!.getAnimations({ subtree: true }).length
			);
			expect(moving).toBe(0);

			await overlay(page).evaluate((element) =>
				element.getAnimations().forEach((animation) => animation.finish())
			);
			await expect(overlay(page)).toHaveCount(0);
			await expect(page.locator('[data-welcome-target]')).toBeVisible();
		});
	});
});

test.describe('signed in', () => {
	test('docks into the sidebar logo on a desktop Home', async ({ page }) => {
		await page.goto('/');
		await expectDockInto(page, page.locator('aside [data-welcome-target]'));
	});

	test.describe('on a phone', () => {
		test.use({ viewport: PIXEL_9_PRO, hasTouch: true });

		test('docks into the top bar logo on Home', async ({ page }) => {
			await page.goto('/');
			await expectDockInto(page, page.getByTestId('top-bar').locator('[data-welcome-target]'));
		});

		test('fades in place on a deeper page, whose top bar shows the way back', async ({ page }) => {
			await page.goto('/people');
			await expect(overlay(page)).toBeVisible();

			await reachTheExit(page);
			await expect(overlay(page)).toHaveClass('fade');

			await overlay(page).evaluate((element) =>
				element.getAnimations().forEach((animation) => animation.finish())
			);
			await expect(overlay(page)).toHaveCount(0);
		});
	});
});

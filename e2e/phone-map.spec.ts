import { expect, test, type Page } from '@playwright/test';
import { appReady, signIn, unfoldPeople } from './app';

/*
 * The People card's map on a phone (docs/05 §5.5): a small preview with two ways in, the map
 * enlarged inside the card, and back. Written after the owner tried it on the phone itself
 * (docs/08 §8.4.1).
 *
 * Read-only against the demo household (Markus Brunner, whom no other spec writes a link onto).
 * Every wait is on an end state — the live map there or gone, the cursor where it goes — never
 * on how long the glide between them takes.
 */

const MARKUS = 'demo-c-markus';
const PIXEL_9_PRO = { width: 412, height: 915 };

test.use({ viewport: PIXEL_9_PRO, hasTouch: true });

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

async function openMarkus(page: Page): Promise<void> {
	await page.goto(`/contacts/${MARKUS}`);
	await expect(page.getByRole('heading', { name: 'Markus Brunner', exact: true })).toBeVisible();
	await appReady(page);
}

const preview = (page: Page) => page.getByTestId('person-map-preview');
const enlarged = (page: Page) => page.getByTestId('person-map-enlarged');
const enlargeButton = (page: Page) => preview(page).getByRole('button', { name: 'Enlarge map' });
const shrinkButton = (page: Page) => enlarged(page).getByRole('button', { name: 'Shrink map' });

/** The frame's drawn height, which is what grows and shrinks in place. */
const frameHeight = async (page: Page) => (await preview(page).boundingBox())?.height ?? 0;

/** Grows the map in place; done once the live map shows and holds the cursor. */
async function enlarge(page: Page): Promise<void> {
	// Disabled until the explorer's code has arrived: there is nothing to enlarge before.
	await expect(enlargeButton(page)).toBeEnabled();
	await enlargeButton(page).click();
	await expect(shrinkButton(page)).toBeFocused();
}

/** Whether the page, or the shell's scroller, reaches past the right edge of the screen. */
const overflowsSideways = (page: Page) =>
	page.evaluate(() =>
		[document.documentElement, document.getElementById('content')].some(
			(el) => el !== null && el.scrollWidth > el.clientWidth
		)
	);

test('a phone shows a preview with its two ways in, not the live map', async ({ page }) => {
	await openMarkus(page);
	const people = page.locator('#section-relationships');

	await expect(people.getByTestId('person-map-preview')).toBeVisible();
	await expect(enlargeButton(page)).toBeEnabled();
	await expect(preview(page).getByRole('link', { name: 'Full screen' })).toHaveAttribute(
		'href',
		`/graph?center=${MARKUS}`
	);
	// The explorer's code has arrived (the button above is enabled), and still only the drawing
	// is in the card.
	expect(await frameHeight(page)).toBeLessThan(150);
	await expect(enlarged(page)).toHaveCount(0);
	await expect(people.locator('canvas')).toHaveCount(0);
});

test('Enlarge grows the map in the card, and Shrink puts the preview back', async ({ page }) => {
	await openMarkus(page);
	const before = await frameHeight(page);

	await enlarge(page);
	// The live map, in the People card, about a screen tall.
	await expect(enlarged(page).locator('canvas').first()).toBeVisible();
	await expect(page.locator('#section-relationships').getByTestId('person-map-enlarged')).toBeVisible();
	await expect.poll(() => frameHeight(page)).toBeGreaterThan(before * 3);

	await shrinkButton(page).click();
	await expect(enlargeButton(page)).toBeFocused();
	// Once the frame is back at its height the live map is taken away.
	await expect(enlarged(page)).toHaveCount(0);
	await expect.poll(() => frameHeight(page)).toBeLessThan(150);
});

test('with reduced motion the map switches at once, without a glide', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await openMarkus(page);
	await expect(enlargeButton(page)).toBeEnabled();

	// The frame wears `contain: layout` exactly while its height is on the way somewhere
	// (RelationshipMap.svelte), so a recorder of its style says whether a glide ever began.
	await preview(page).evaluate((frame: HTMLElement & { glided?: boolean }) => {
		frame.glided = false;
		new MutationObserver(() => {
			if (frame.style.contain === 'layout') frame.glided = true;
		}).observe(frame, { attributes: true, attributeFilter: ['style'] });
	});
	const glided = () =>
		preview(page).evaluate((frame: HTMLElement & { glided?: boolean }) => frame.glided);

	await enlarge(page);
	await expect(enlarged(page).locator('canvas').first()).toBeVisible();
	expect(await glided()).toBe(false);

	await shrinkButton(page).click();
	await expect(enlargeButton(page)).toBeFocused();
	await expect(enlarged(page)).toHaveCount(0);
	expect(await glided()).toBe(false);
});

test.describe('at 360px', () => {
	test.use({ viewport: { width: 360, height: 780 } });

	test('nothing reaches past the screen with the card unfolded', async ({ page }) => {
		await openMarkus(page);
		await unfoldPeople(page);
		await expect(page.getByTestId('relationship-list').getByRole('heading', { name: /^Friends · / })).toBeVisible();
		expect(await overflowsSideways(page)).toBe(false);
	});

	test('nothing reaches past the screen with the map enlarged', async ({ page }) => {
		await openMarkus(page);
		await enlarge(page);
		await expect(enlarged(page).locator('canvas').first()).toBeVisible();
		expect(await overflowsSideways(page)).toBe(false);
	});
});

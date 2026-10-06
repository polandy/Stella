import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { addPerson, signIn } from './app';

/*
 * The shell's way past itself and the two overlays that are real modal dialogs (docs/05 §5.9):
 * the skip link, the photo viewer and the phone's composer sheet. Written after the owner
 * signed the change off in the running app (docs/08 §8.4.1). The contrast half of that change
 * is held by `color.test.ts` and `tokens.test.ts`.
 *
 * The photo cases work on a person they invent, so no other spec's gallery moves.
 */

const PIXEL = readFileSync('e2e/fixtures/monica-photos/photos/ottilie-avatar.png');
const file = (name: string) => ({ name, mimeType: 'image/png', buffer: PIXEL });

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

/** Whether keyboard focus is somewhere inside this element. */
const holdsFocus = (scope: Locator) => scope.evaluate((el) => el.contains(document.activeElement));

/**
 * Where focus is, measured against a dialog: inside it, nowhere in the page (the browser's own
 * controls, which a native modal dialog hands Tab to past its last stop), or on the page behind.
 */
const focusIn = (scope: Locator) =>
	scope.evaluate((el) => {
		const active = document.activeElement;
		if (!active || active === document.body) return 'browser';
		return el.contains(active) ? 'dialog' : `behind: ${active.outerHTML.slice(0, 80)}`;
	});

/**
 * Tabs forwards round the whole dialog until focus is back on the stop it started from. Every
 * stop on the way is the dialog's own — or, past its last one, the browser's, as the platform
 * does for a modal dialog — and never anything on the page behind. Arriving back at the start
 * is the positive signal that the round was walked, not cut short.
 */
async function expectFocusTrapped(page: Page, scope: Locator): Promise<void> {
	const marker = 'data-trap-start';
	await page.evaluate((m) => document.activeElement?.setAttribute(m, ''), marker);
	const bound = (await tabStops(scope)) + 2;
	for (let i = 1; i <= bound; i++) {
		await page.keyboard.press('Tab');
		const where = await focusIn(scope);
		expect(where, `Tab ${i} took focus out of the dialog`).not.toMatch(/^behind/);
		if (await scope.evaluate((_, m) => !!document.activeElement?.hasAttribute(m), marker)) return;
	}
	throw new Error(`focus did not come back round to where it started within ${bound} Tab presses`);
}

/** How many stops a keyboard has inside this element. */
const tabStops = (scope: Locator) =>
	scope.evaluate(
		(el) =>
			[
				...el.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]')
			].filter(
				(c) => c.tabIndex >= 0 && !c.hasAttribute('disabled') && c.getClientRects().length > 0
			).length
	);

test('the first Tab shows the skip link, and following it puts focus on the page itself', async ({
	page
}) => {
	const skip = page.getByRole('link', { name: 'Skip to content' });
	await page.keyboard.press('Tab');
	await expect(skip).toBeFocused();
	await expect(skip).toBeInViewport();

	await page.keyboard.press('Enter');
	const content = page.locator('#content');
	await expect(content).toBeFocused();

	// The next stop is in the page, past the sidebar's links.
	await page.keyboard.press('Tab');
	expect(await holdsFocus(content)).toBe(true);
	expect(await holdsFocus(page.getByRole('complementary').first())).toBe(false);
});

test.describe('the photo viewer', () => {
	/** A person of their own (one per case) with three photos, so the walk can wrap at either end. */
	async function personWithPhotos(
		page: Page,
		last: string
	): Promise<{ thumbnails: Locator; ids: string[] }> {
		await addPerson(page, 'Fotini', last);
		await page.getByRole('button', { name: 'Add photos' }).click();
		const form = page.locator('#section-photos form');
		await form
			.locator('input[name=files]')
			.setInputFiles([file('one.png'), file('two.png'), file('three.png')]);
		await form.getByRole('button', { name: 'Add', exact: true }).click();

		const thumbnails = page.getByTestId('photo-grid').locator('li > button');
		await expect(thumbnails).toHaveCount(3);
		const ids = await thumbnails
			.locator('img')
			.evaluateAll((imgs) =>
				imgs.map((img) => new URL((img as HTMLImageElement).src).pathname.split('/').pop()!)
			);
		return { thumbnails, ids };
	}

	/** The photo the viewer is showing, by the full-size picture it holds. */
	const showing = (lightbox: Locator, id: string) => lightbox.locator(`img[src="/media/${id}"]`);

	test('is a modal dialog that takes focus in and keeps it there', async ({ page }) => {
		const { thumbnails } = await personWithPhotos(page, 'Fallenstein');
		await thumbnails.nth(0).click();

		const lightbox = page.getByRole('dialog', { name: 'Photo' });
		await expect(lightbox).toBeVisible();
		await expect.poll(() => holdsFocus(lightbox)).toBe(true);
		expect(await lightbox.evaluate((d) => (d as HTMLDialogElement).matches(':modal'))).toBe(true);

		await expectFocusTrapped(page, lightbox);
	});

	test('the arrows step through the photos and wrap, Escape hands focus back to the thumbnail', async ({
		page
	}) => {
		const { thumbnails, ids } = await personWithPhotos(page, 'Wanderlich');
		await thumbnails.nth(1).click();
		const lightbox = page.getByTestId('photo-lightbox');
		await expect(showing(lightbox, ids[1])).toBeVisible();

		await page.keyboard.press('ArrowRight');
		await expect(showing(lightbox, ids[2])).toBeVisible();
		// Past the last photo comes the first.
		await page.keyboard.press('ArrowRight');
		await expect(showing(lightbox, ids[0])).toBeVisible();
		// And before the first, the last.
		await page.keyboard.press('ArrowLeft');
		await expect(showing(lightbox, ids[2])).toBeVisible();

		// Escape closes, and focus lands on the thumbnail of the photo that was showing.
		await page.keyboard.press('Escape');
		await expect(lightbox).toHaveCount(0);
		await expect(thumbnails.nth(2)).toBeFocused();
	});

	test('leaves the arrows to the caption while it is being typed', async ({ page }) => {
		const { thumbnails, ids } = await personWithPhotos(page, 'Tastenreich');
		await thumbnails.nth(0).click();
		const lightbox = page.getByTestId('photo-lightbox');
		await expect(showing(lightbox, ids[0])).toBeVisible();

		const caption = lightbox.getByLabel('Caption');
		await caption.fill('At the lake');
		await expect(caption).toBeFocused();
		const caretAt = () => caption.evaluate((input) => (input as HTMLInputElement).selectionStart);
		expect(await caretAt()).toBe('At the lake'.length);

		// The caret moves — the field had the key — and the photo stays the one being captioned.
		await page.keyboard.press('ArrowLeft');
		await expect.poll(caretAt).toBe('At the lake'.length - 1);
		await expect(showing(lightbox, ids[0])).toBeVisible();
		await expect(caption).toHaveValue('At the lake');
	});
});

test.describe('the composer sheet on a phone', () => {
	test.use({ viewport: { width: 412, height: 915 }, hasTouch: true });

	test('is a modal dialog that keeps focus inside, and Escape closes it', async ({ page }) => {
		const pencil = page.locator('nav').getByRole('link', { name: 'Write a moment' });
		await pencil.click();

		const sheet = page.getByRole('dialog', { name: 'Write a moment' });
		await expect(sheet).toBeVisible();
		await expect(page.getByLabel('What happened?')).toBeFocused();
		expect(await sheet.evaluate((d) => (d as HTMLDialogElement).matches(':modal'))).toBe(true);

		await expectFocusTrapped(page, sheet);

		await page.keyboard.press('Escape');
		await expect(pencil).toBeVisible();
		await expect(page.getByTestId('compose-sheet')).toHaveCount(0);
		await expect(page).not.toHaveURL(/compose/);
	});
});

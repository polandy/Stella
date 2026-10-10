import { expect, test, type Page } from '@playwright/test';
import { addPerson, appReady, signIn } from './app';

/*
 * Writing a moment on a person's own page (UX review C6, docs/02 §2.20, §2.22.1, docs/05 §5.5):
 * *Write a moment* opens Home's composer at the top of the Activity card, anchored on that
 * person, and *Log contact* takes turns with it in the same spot. Written after the owner tried
 * it in the app (docs/08 §8.4.1).
 *
 * Each case that writes adds its own person, so what it saves lands on nobody another spec
 * reads. The phone and jump-bar cases only open forms on a demo person and save nothing.
 */

/** Six letters no other attempt shares. */
function runLetters(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) =>
		String.fromCharCode(97 + (byte % 26))
	).join('');
}

/** A surname only this case uses, capitalised as a name typed by hand would be. */
const surname = () => `Tessaly${runLetters()}`;

const composer = (page: Page) => page.getByTestId('story-composer');
const field = (page: Page, first: string) =>
	composer(page).getByRole('textbox', { name: `What happened with ${first}?` });
const writeButton = (page: Page) =>
	page.getByTestId('identity-actions').getByRole('link', { name: 'Write a moment' });
const story = (page: Page) => page.locator('#section-story');
const toasts = (page: Page) => page.getByTestId('toasts');

/** Presses *Write a moment* and waits for the composer to hold the cursor. */
async function openComposer(page: Page, first: string): Promise<void> {
	await writeButton(page).click();
	await expect(field(page, first)).toBeFocused();
}

/** Saves the open composer and waits for the card to say so. */
async function save(page: Page): Promise<void> {
	await composer(page).getByRole('button', { name: /^Save/ }).click();
	await expect(toasts(page).getByText('Saved', { exact: true }).first()).toBeVisible();
	await expect(composer(page)).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('writes a moment in place, anchored on the person, and a second one joins the day', async ({
	page
}) => {
	const last = surname();
	await addPerson(page, 'Odile', last);

	await openComposer(page, 'Odile');
	await expect(composer(page).locator('[data-anchor]')).toContainText(`Odile ${last}`);
	await expect(composer(page).locator('[data-anchor]')).toContainText('goes to Odile’s journal');
	// The page has not gone anywhere: the composer is on the person's own page.
	await expect(page).toHaveURL(/\/contacts\/[^/]+$/);

	// `@` offers everyone but the anchor: the offer to create shows the list is there.
	await field(page, 'Odile').pressSequentially('@Odile');
	const list = composer(page).getByRole('listbox', { name: 'People' });
	await expect(list.getByRole('option', { name: /Create.*Odile/ })).toBeVisible();
	await expect(list.getByRole('option', { name: new RegExp(last) })).toHaveCount(0);

	// No mention is needed: the moment belongs to her already.
	await field(page, 'Odile').fill('built a sandcastle taller than herself');
	await save(page);
	const top = story(page).locator('[data-story-item]').first();
	await expect(top).toContainText('built a sandcastle taller than herself');

	// A second moment the same day is added to that day's entry, not set beside it.
	await openComposer(page, 'Odile');
	await field(page, 'Odile').fill('and then dug a moat around it');
	await save(page);
	await expect(top).toContainText('and then dug a moat around it');
	await expect(top).toContainText('built a sandcastle taller than herself');
	await expect(
		story(page).locator('[data-story-item]', { hasText: 'built a sandcastle' })
	).toHaveCount(1);
});

test('cancelling folds the composer away, and Undo brings typed text back', async ({ page }) => {
	await addPerson(page, 'Odile', surname());

	// Nothing typed, nothing to offer back.
	await openComposer(page, 'Odile');
	await composer(page).getByRole('button', { name: 'Cancel' }).click();
	await expect(composer(page)).toHaveCount(0);
	await expect(story(page).getByRole('button', { name: 'Log contact' })).toBeFocused();
	await expect(toasts(page).getByText('Moment discarded')).toHaveCount(0);

	await openComposer(page, 'Odile');
	await field(page, 'Odile').fill('a thought half finished');
	await field(page, 'Odile').press('Escape');
	await expect(composer(page)).toHaveCount(0);
	await expect(toasts(page).getByText('Moment discarded')).toBeVisible();

	await toasts(page).getByRole('button', { name: 'Undo' }).click();
	await expect(field(page, 'Odile')).toHaveValue('a thought half finished');
	await expect(field(page, 'Odile')).toBeFocused();
});

test('Log contact and the composer take turns in one spot, keeping what was typed', async ({
	page
}) => {
	await addPerson(page, 'Odile', surname());
	const kind = story(page).getByRole('combobox', { name: 'Kind' });

	await openComposer(page, 'Odile');
	await field(page, 'Odile').fill('met at the bakery');

	await story(page).getByRole('button', { name: 'Log contact' }).click();
	await expect(kind).toBeVisible();
	await expect(composer(page)).toHaveCount(0);

	await writeButton(page).click();
	await expect(field(page, 'Odile')).toHaveValue('met at the bakery');
	await expect(kind).toHaveCount(0);
});

test('Open journal leads to the journal page', async ({ page }) => {
	await addPerson(page, 'Odile', surname());
	const personPage = new URL(page.url()).pathname;

	await story(page).getByRole('link', { name: 'Open journal' }).click();
	await expect(page.getByRole('heading', { name: 'Journal' })).toBeVisible();
	await expect(page).toHaveURL(`${personPage}/journal`);
});

test('creates a person named with @ in the anchored composer and mentions them', async ({
	page
}) => {
	await addPerson(page, 'Odile', surname());
	const newcomer = `Ysolde${runLetters()}`;

	await openComposer(page, 'Odile');
	await field(page, 'Odile').pressSequentially(`walked the dogs with @${newcomer}`);
	await composer(page)
		.getByRole('option', { name: new RegExp(`Create.*${newcomer}`) })
		.click();
	const panel = composer(page).getByTestId('composer-create');
	await panel.getByLabel('Description').fill('From the dog park');
	await panel.getByRole('button', { name: 'Add to the moment' }).click();
	await save(page);

	// The moment is Odile's, and names the newcomer by a link to the person just made.
	const top = story(page).locator('[data-story-item]').first();
	await expect(top).toContainText('walked the dogs with');
	await top.getByRole('link', { name: new RegExp(newcomer) }).click();
	await expect(page.getByRole('heading', { name: newcomer })).toBeVisible();
});

test.describe('the jump bar', () => {
	// The demo page is short enough at this size that Photos can never reach the bar: the page
	// stops at its foot, where by position alone the bar would mark the last card on screen.
	// Only the tap can leave Photos marked.
	test.use({ viewport: { width: 1440, height: 900 } });

	test('marks the card it was tapped for, even one the page cannot bring to the top', async ({
		page
	}) => {
		await page.goto('/contacts/demo-c-markus');
		await appReady(page);
		const bar = page.getByRole('navigation', { name: 'Parts of this page' });
		// The bar shows only once the identity card has gone by (docs/05 §5.5).
		await page
			.locator('#section-relationships')
			.evaluate((el) => el.scrollIntoView({ block: 'start' }));
		await expect(bar).toHaveAttribute('data-visible', 'true');

		await bar.getByRole('link', { name: /^Photos/ }).click();
		await expect(page).toHaveURL(/#section-photos$/);
		await expect(page.locator('#section-photos')).toBeFocused();
		await expect(bar.locator('[aria-current="location"]')).toHaveText(/^Photos/);
	});

	test('takes the cursor where it sticks, without the page jumping back to the top', async ({
		page
	}) => {
		await page.goto('/contacts/demo-c-markus');
		await appReady(page);
		const bar = page.getByRole('navigation', { name: 'Parts of this page' });
		await page
			.locator('#section-relationships')
			.evaluate((el) => el.scrollIntoView({ block: 'start' }));
		await expect(bar).toHaveAttribute('data-visible', 'true');

		// The stuck bar lies in the scroller's top padding, which the browser counts as out of
		// sight: a cursor arriving there used to scroll the bar back to where it rests, hidden.
		await bar.getByRole('link', { name: /^People/ }).focus();
		await page.keyboard.press('Tab');
		await expect(bar.getByRole('link', { name: /^Photos/ })).toBeFocused();
		await expect(bar).toHaveAttribute('data-visible', 'true');
	});
});

test.describe('on a phone whose address bar is showing', () => {
	/*
	 * A phone browser counts 100vh with its address bar hidden, so while the bar shows the
	 * document can be a little taller than the screen. Then a glide that scrolled the document
	 * too carried the sticky bars off the top (docs/05 §5.11). The body is pinned to that taller
	 * height here as a stand-in for the bar, and the glides run as a reader sees them.
	 */
	test.use({
		viewport: { width: 412, height: 915 },
		isMobile: true,
		hasTouch: true,
		contextOptions: { reducedMotion: 'no-preference' }
	});

	/** Starts recording the most the document ever scrolled, and whether the shell has stopped. */
	async function watchScrolling(page: Page): Promise<void> {
		await page.evaluate(() => {
			const record = window as unknown as { docMost: number; settled: boolean };
			record.docMost = 0;
			record.settled = false;
			const content = document.getElementById('content')!;
			content.addEventListener('scroll', () => (record.settled = false));
			content.addEventListener('scrollend', () => (record.settled = true));
			window.addEventListener('scroll', () => {
				record.docMost = Math.max(record.docMost, document.scrollingElement!.scrollTop);
			});
		});
	}

	/** Waits until the shell has glided and stopped, then reads what the document did. */
	async function expectOnlyTheShellMoved(page: Page): Promise<void> {
		await expect
			.poll(() =>
				page.evaluate(() => {
					const record = window as unknown as { settled: boolean };
					return record.settled && document.getElementById('content')!.scrollTop > 0;
				})
			)
			.toBe(true);
		const after = await page.evaluate(() => ({
			docMost: (window as unknown as { docMost: number }).docMost,
			doc: document.scrollingElement!.scrollTop,
			barTop: document.querySelector('[data-testid="jump-bar"]')!.getBoundingClientRect().top
		}));
		expect(after.docMost).toBe(0);
		expect(after.doc).toBe(0);
		expect(after.barTop).toBeGreaterThanOrEqual(0);
	}

	// Dispatched rather than clicked: a click first scrolls its target into view itself, by every
	// scrollable ancestor, which is the very thing under test.
	const actions: [string, (page: Page) => Promise<void>][] = [
		['Write a moment', (page) => writeButton(page).dispatchEvent('click')],
		[
			'the jump bar’s Notes',
			(page) =>
				page
					.getByRole('navigation', { name: 'Parts of this page' })
					.getByRole('link', { name: /^Notes/ })
					.dispatchEvent('click')
		],
		[
			'Add note',
			(page) =>
				page
					.locator('#section-notes')
					.getByRole('button', { name: 'Add note' })
					.dispatchEvent('click')
		],
		[
			'Log contact',
			(page) =>
				page
					.locator('#section-story')
					.getByRole('button', { name: 'Log contact' })
					.dispatchEvent('click')
		]
	];

	for (const [name, act] of actions) {
		test(`${name} glides the shell alone, leaving the bars on screen`, async ({ page }) => {
			await page.goto('/contacts/demo-c-markus');
			await appReady(page);
			await page.addStyleTag({ content: 'body { min-height: 975px !important; }' });
			// The stand-in works: the document could scroll, so staying put means something.
			expect(
				await page.evaluate(
					() => document.scrollingElement!.scrollHeight > document.scrollingElement!.clientHeight
				)
			).toBe(true);
			await watchScrolling(page);

			await act(page);
			await expectOnlyTheShellMoved(page);
		});
	}
});

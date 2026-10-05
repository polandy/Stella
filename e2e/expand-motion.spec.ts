import { expect, test, type Locator, type Page } from '@playwright/test';
import { appReady, signIn } from './app';

/*
 * The one expand/collapse motion (docs/05 §5.11): a row unfolding and folding in place, turned
 * round mid-way, the People card's list growing and shrinking, and a line gliding into its
 * editor and back. Written after the owner tried it in the running app (docs/08 §8.4.1).
 *
 * Read-only against the demo household: Markus Brunner's page, whose rows are only unfolded and
 * whose name editor is only opened and escaped from (identity-card.spec.ts and
 * people-card.spec.ts read him the same way).
 *
 * Nothing here is timed (docs/08 §8.4.2). The page records every step the motion primitive
 * takes — each `data-motion` a gliding box is given, each reveal that lands or leaves, each
 * pane that turns inert on its way out — and the cases wait on that record, never on 300 ms.
 */

const MARKUS = 'demo-c-markus';

// The motion is what this spec is about, so it runs with it (playwright.config.ts).
test.use({ contextOptions: { reducedMotion: 'no-preference' } });

test.beforeEach(async ({ page }) => {
	await signIn(page);
	await page.goto(`/contacts/${MARKUS}`);
	await expect(page.getByRole('heading', { name: 'Markus Brunner', exact: true })).toBeVisible();
	await expect(page.locator('#section-relationships')).toBeVisible();
	await appReady(page);
});

/** The elements the record follows, by a name the cases read it under. */
const WATCHED = {
	// The Dates row on the identity card starts folded; this is the body it unfolds.
	dates: '[data-identity-row="dates"] > section[data-row] > div:not([data-row-actions])',
	// The People card's rows, which glide between their folded and unfolded heights.
	people: '[data-testid="people-rows"]',
	// The name line and its editor: a Swap box, and the two panes crossing over in it.
	name: 'div:has(> [data-pane] > h1)',
	'name-line': 'div:has(> [data-pane] > h1) > [data-pane="off"]',
	'name-editor': 'div:has(> [data-pane] > h1) > [data-pane="on"]'
} as const;
type Watched = keyof typeof WATCHED;

interface MotionRecord {
	motionLog: { name: string; step: string }[];
}

/**
 * Starts recording, in the page, each step the motion primitive (`src/lib/motion/`) takes on
 * the watched elements:
 * - `moving` / `settled` — every `data-motion` a gliding box is given; a MutationObserver sees
 *   each write, the same value written again included, so an instant switch shows as `settled`
 *   alone;
 * - `introend` / `outroend` — a reveal that has landed or gone, Svelte's own events, caught on
 *   the way down because they do not bubble;
 * - `inert` — a block or pane on its way out, which stops answering at once (noted when it
 *   turns, not each time it is told).
 */
async function recordMotion(page: Page): Promise<void> {
	await page.evaluate((watched) => {
		const log: MotionRecord['motionLog'] = [];
		Object.assign(window, { motionLog: log });
		const nameOf = (el: Element) => Object.entries(watched).find(([, selector]) => el.matches(selector))?.[0];
		const note = (el: Element, step: string) => {
			const name = nameOf(el);
			if (name) log.push({ name, step });
		};
		new MutationObserver((mutations) => {
			for (const { target, attributeName, oldValue } of mutations) {
				if (!(target instanceof HTMLElement)) continue;
				if (attributeName === 'data-motion') note(target, target.dataset.motion ?? '');
				// Svelte marks an outroing block inert as well as the primitive: the turn is noted once.
				else if (attributeName === 'inert' && target.inert && oldValue === null) note(target, 'inert');
			}
		}).observe(document.body, {
			subtree: true,
			attributes: true,
			attributeOldValue: true,
			attributeFilter: ['data-motion', 'inert']
		});
		for (const type of ['introend', 'outroend']) {
			document.addEventListener(type, (event) => event.target instanceof Element && note(event.target, type), true);
		}
	}, WATCHED);
}

/** The steps recorded so far for one watched element, in order. */
const stepsOf = (page: Page, name: Watched) =>
	page.evaluate(
		(name) => (window as unknown as MotionRecord).motionLog.filter((entry) => entry.name === name).map((entry) => entry.step),
		name
	);

async function boxOf(locator: Locator) {
	const box = await locator.boundingBox();
	if (!box) throw new Error(`${locator} has no layout`);
	return box;
}

const identityCard = (page: Page) => page.getByTestId('identity-card');
const datesRow = (page: Page) => page.locator('[data-identity-row="dates"] > section[data-row]');
const datesToggle = (page: Page) => datesRow(page).getByRole('button', { name: /^Dates/ });
const datesBody = (page: Page) => page.locator(WATCHED.dates);

const peopleCard = (page: Page) => page.locator('#section-relationships');
const peopleRows = (page: Page) => page.getByTestId('people-rows');
const showMore = (page: Page) => peopleCard(page).getByRole('button', { name: /^Show \d+ more$/ });
const showFewer = (page: Page) => peopleCard(page).getByRole('button', { name: 'Show fewer' });

test('a row unfolds and folds in place, and the card above it holds still', async ({ page }) => {
	await expect(datesToggle(page)).toHaveAttribute('aria-expanded', 'false');
	const cardBefore = await boxOf(identityCard(page));
	const lineBefore = await boxOf(datesToggle(page));
	const rowBefore = await boxOf(datesRow(page));
	await recordMotion(page);

	await datesToggle(page).click();

	// Landed: the reveal has ended, and what it brought is there and answers.
	await expect.poll(() => stepsOf(page, 'dates')).toEqual(['introend']);
	await expect(datesToggle(page)).toHaveAttribute('aria-expanded', 'true');
	await expect(datesBody(page)).toBeVisible();
	await expect(datesBody(page)).not.toHaveAttribute('inert');
	// Only what is below the row moved: the card's top and the line pressed stayed put.
	expect((await boxOf(identityCard(page))).y).toBeCloseTo(cardBefore.y, 0);
	expect((await boxOf(datesToggle(page))).y).toBeCloseTo(lineBefore.y, 0);
	expect((await boxOf(datesRow(page))).height).toBeGreaterThan(rowBefore.height);

	await datesToggle(page).click();

	// Gone: inert from its first frame, removed once the reveal has run back.
	await expect.poll(() => stepsOf(page, 'dates')).toEqual(['introend', 'inert', 'outroend']);
	await expect(datesBody(page)).toHaveCount(0);
	await expect(datesToggle(page)).toHaveAttribute('aria-expanded', 'false');
	const cardAfter = await boxOf(identityCard(page));
	expect(cardAfter.y).toBeCloseTo(cardBefore.y, 0);
	expect(cardAfter.height).toBeCloseTo(cardBefore.height, 0);
	expect((await boxOf(datesRow(page))).height).toBeCloseTo(rowBefore.height, 0);
});

test('pressed again mid-way, a row turns round and lands folded, where it started', async ({ page }) => {
	await expect(datesToggle(page)).toHaveAttribute('aria-expanded', 'false');
	const cardBefore = await boxOf(identityCard(page));
	const rowBefore = await boxOf(datesRow(page));
	await recordMotion(page);

	await datesToggle(page).click();
	// The body is on the page from the reveal's first frame; the second press follows at once.
	await expect(datesBody(page)).toHaveCount(1);
	await datesToggle(page).click();

	// However far it had got, it ends folded: the reveal ran back and the body is gone. Whether
	// it had landed before the second press is the runner's timing, so only the end is read.
	await expect.poll(async () => (await stepsOf(page, 'dates')).slice(-2)).toEqual(['inert', 'outroend']);
	await expect(datesBody(page)).toHaveCount(0);
	await expect(datesToggle(page)).toHaveAttribute('aria-expanded', 'false');
	// No jump on landing: the row and the card are exactly as they were before the first press.
	const rowAfter = await boxOf(datesRow(page));
	expect(rowAfter.y).toBeCloseTo(rowBefore.y, 0);
	expect(rowAfter.height).toBeCloseTo(rowBefore.height, 0);
	const cardAfter = await boxOf(identityCard(page));
	expect(cardAfter.y).toBeCloseTo(cardBefore.y, 0);
	expect(cardAfter.height).toBeCloseTo(cardBefore.height, 0);
});

test('Show more and Show fewer glide the People list between its two heights', async ({ page }) => {
	const people = peopleRows(page).getByRole('link');
	await expect(showMore(page)).toBeVisible();
	await expect(peopleRows(page)).toHaveAttribute('data-motion', 'settled');
	const folded = await people.count();
	const foldedHeight = (await boxOf(peopleRows(page))).height;
	await recordMotion(page);

	await showMore(page).click();

	await expect.poll(() => stepsOf(page, 'people')).toEqual(['moving', 'settled']);
	await expect(showFewer(page)).toBeVisible();
	expect(await people.count()).toBeGreaterThan(folded);
	// Settled means let go: the box is its content's height again, no longer clipped to a frame.
	const unfoldedHeight = (await boxOf(peopleRows(page))).height;
	expect(unfoldedHeight).toBeGreaterThan(foldedHeight);
	await expect(peopleRows(page)).not.toHaveCSS('overflow', 'clip');

	await showFewer(page).click();

	await expect.poll(() => stepsOf(page, 'people')).toEqual(['moving', 'settled', 'moving', 'settled']);
	await expect(showMore(page)).toBeVisible();
	await expect(people).toHaveCount(folded);
	expect((await boxOf(peopleRows(page))).height).toBeCloseTo(foldedHeight, 0);
	await expect(peopleRows(page)).not.toHaveCSS('overflow', 'clip');
});

test('the name glides into its editor and back, and the cursor goes where it always went', async ({ page }) => {
	const nameLine = page.getByRole('button', { name: 'Markus Brunner', exact: true });
	await expect(nameLine).toBeVisible();
	await recordMotion(page);

	await nameLine.click();

	// The form takes the cursor at once; the line it replaced stopped answering as it went.
	await expect(page.getByRole('textbox', { name: 'First name' })).toBeFocused();
	await expect.poll(() => stepsOf(page, 'name')).toEqual(['moving', 'settled']);
	await expect.poll(() => stepsOf(page, 'name-line')).toEqual(['inert', 'outroend']);
	await expect(page.locator(WATCHED['name-line'])).toHaveCount(0);
	await expect(page.locator(WATCHED['name-editor'])).not.toHaveAttribute('inert');

	await page.keyboard.press('Escape');

	// Escape hands the cursor back to the name; the editor, faded in on opening, went inert and
	// then went.
	await expect(nameLine).toBeFocused();
	await expect.poll(() => stepsOf(page, 'name')).toEqual(['moving', 'settled', 'moving', 'settled']);
	await expect.poll(() => stepsOf(page, 'name-editor')).toEqual(['introend', 'inert', 'outroend']);
	await expect(page.locator(WATCHED['name-editor'])).toHaveCount(0);
	await expect(page.getByTestId('name-editor')).toHaveCount(0);
});

test.describe('with reduced motion', () => {
	test.use({ contextOptions: { reducedMotion: 'reduce' } });

	test('the People list switches at once, settled without ever moving', async ({ page }) => {
		const people = peopleRows(page).getByRole('link');
		await expect(showMore(page)).toBeVisible();
		const folded = await people.count();
		await recordMotion(page);

		await showMore(page).click();

		// The box was told it had arrived — once, and with no glide before it.
		await expect.poll(() => stepsOf(page, 'people')).toEqual(['settled']);
		await expect(showFewer(page)).toBeVisible();
		expect(await people.count()).toBeGreaterThan(folded);
	});
});

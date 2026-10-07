import { expect, test, type Locator, type Page } from '@playwright/test';
import { appReady, signIn } from './app';

/*
 * *Settings → Immich → Find your people* (docs/02 §2.24.7): the
 * household's people next to the Immich faces their names match. Written after the owner tried
 * #246 in the preview (docs/08 §8.4.1).
 *
 * The e2e server runs with `IMMICH_DEMO=true`, whose faces are named like the demo seed's people
 * (`src/lib/server/immich/demo-library.ts`): full names that agree are *likely*; Luca Widmer's two
 * same-named faces, the half-there double names of Rosa Brunner-Aebi and Sandra Brunner-Keller,
 * and the first-name-only "Timo" are *maybes*; Corinne Keller's face is hidden, so it is never
 * offered. (The demo's unnamed face is never offered either, but no name can match it, so no
 * screen could show it missing; `src/lib/immich/match.test.ts` holds that rule.)
 *
 * One Immich face links to one person only, and the faces are shared by the whole suite: the
 * other Immich specs link people of their own to every face this list proposes as likely. So
 * whatever a case here links it unlinks again afterwards, and the list is read for the rows
 * this spec names rather than for an exact count — what ran before it decides which faces are
 * still free.
 */

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

/** The person pages of the people a case linked, unlinked again after it. */
const linkedHere: string[] = [];

test.afterEach(async ({ page }) => {
	while (linkedHere.length > 0) await unlink(page, linkedHere.pop()!);
});

/** Unlinks the person at `href` through their Photos card, if the case got as far as linking. */
async function unlink(page: Page, href: string): Promise<void> {
	await page.goto(href);
	await appReady(page);
	await page.getByRole('button', { name: 'Immich options' }).click();
	const unlinkItem = page.getByRole('menuitem', { name: 'Unlink from Immich' });
	const findItem = page.getByRole('menuitem', { name: 'Find in Immich' });
	await expect(unlinkItem.or(findItem)).toBeVisible();
	if (!(await unlinkItem.isVisible())) return;
	await unlinkItem.click();
	await appReady(page);
	await page.getByRole('button', { name: 'Immich options' }).click();
	await expect(findItem).toBeVisible();
}

const rows = (page: Page) => page.getByTestId('immich-match');
const row = (page: Page, name: string) => rows(page).filter({ hasText: name });
const likelyRows = (page: Page) => page.locator('[data-testid="immich-match"][data-kind="likely"]');

/** The list with its rows in: the row of someone every case leaves unlinked is the signal. */
async function listShown(page: Page): Promise<void> {
	await expect(row(page, 'Rosa Brunner-Aebi')).toBeVisible();
	await appReady(page);
}

/** Opens *Find your people* the way a member does, through its card in Settings. */
async function openFromSettings(page: Page): Promise<void> {
	await page.getByRole('link', { name: 'Settings' }).first().click();
	await page.getByRole('link', { name: /Find your people/ }).click();
	await expect(page.getByRole('heading', { name: 'Find your people', level: 1 })).toBeVisible();
	await listShown(page);
}

/** The person page a row's name links to. */
async function hrefOf(rowLocator: Locator): Promise<string> {
	const href = await rowLocator.getByRole('link').first().getAttribute('href');
	if (!href) throw new Error('A row of the list links to nobody.');
	return href;
}

test('Settings leads to the list: likely rows first, then the maybes, and no hidden face', async ({
	page
}) => {
	await page.goto('/settings');
	await appReady(page);
	await expect(page.getByText('Link the people in Stella to their faces in Immich.')).toBeVisible();
	await openFromSettings(page);

	// Likely: a full name that agrees, one face, a one-tap Link with the face's photo count.
	for (const name of ['Markus Brunner', 'Lena Brunner', 'Noah Brunner', 'Mia Widmer']) {
		const likely = row(page, `In Immich: ${name}`);
		await expect(likely).toHaveAttribute('data-kind', 'likely');
		await expect(likely.getByRole('button', { name: `Link ${name} to ${name}` })).toBeVisible();
	}
	await expect(row(page, 'In Immich: Mia Widmer')).toContainText('1 photo');

	// Maybes ask, and Luca's two same-named faces stand side by side, told apart by their photos.
	const luca = row(page, 'Luca Widmer');
	await expect(luca).toHaveAttribute('data-kind', 'maybe');
	await expect(luca.getByRole('link', { name: 'Which of these is Luca Widmer?' })).toBeVisible();
	const lucaFaces = luca.getByRole('button', {
		name: 'Link Luca Widmer to Luca Widmer'
	});
	await expect(lucaFaces).toHaveCount(2);
	await expect(lucaFaces.filter({ hasText: '210 photos' })).toHaveCount(1);
	await expect(lucaFaces.filter({ hasText: '3 photos' })).toHaveCount(1);
	for (const [name, face] of [
		['Rosa Brunner-Aebi', 'Rosa Brunner'],
		['Sandra Brunner-Keller', 'Sandra Brunner'],
		['Timo Brunner', 'Timo']
	]) {
		const maybe = row(page, name);
		await expect(maybe).toHaveAttribute('data-kind', 'maybe');
		await expect(maybe.getByRole('link', { name: `Could this be ${name}?` })).toBeVisible();
		await expect(maybe.getByRole('button', { name: `Link ${face} to ${name}` })).toBeVisible();
	}

	// Every likely row comes before the first maybe.
	const kinds = await rows(page).evaluateAll((items) =>
		items.map((item) => item.getAttribute('data-kind'))
	);
	expect(kinds.indexOf('maybe')).toBeGreaterThan(0);
	expect(kinds.lastIndexOf('likely')).toBeLessThan(kinds.indexOf('maybe'));

	// Corinne Keller is in Stella, but her face is hidden in Immich: the list, already in above,
	// does not offer it.
	await expect(row(page, 'Corinne Keller')).toHaveCount(0);
});

test('Link takes one likely row, and it stays linked', async ({ page }) => {
	await openFromSettings(page);
	const mia = row(page, 'In Immich: Mia Widmer');
	linkedHere.push(await hrefOf(mia));

	await mia.getByRole('button', { name: 'Link Mia Widmer to Mia Widmer' }).click();
	await expect(page.getByTestId('immich-match-linked')).toHaveText('1 person linked.');
	await expect(mia).toHaveCount(0);
	await expect(row(page, 'In Immich: Markus Brunner')).toBeVisible();

	// Read afresh, she is not proposed again — and her page says she is in Immich.
	await page.reload();
	await listShown(page);
	await expect(row(page, 'In Immich: Markus Brunner')).toBeVisible();
	await expect(row(page, 'Mia Widmer')).toHaveCount(0);
	await page.goto(linkedHere[0]);
	await expect(page.getByText('In Immich · 1 photo')).toBeVisible();
});

test('Link all likely links every likely row and leaves the maybes', async ({ page }) => {
	await openFromSettings(page);
	const likely = likelyRows(page);
	const count = await likely.count();
	expect(count).toBeGreaterThan(1);
	for (const each of await likely.all()) linkedHere.push(await hrefOf(each));

	await page.getByRole('button', { name: `Link all likely (${count})` }).click();
	await expect(page.getByTestId('immich-match-linked')).toHaveText(`${count} people linked.`);
	await expect(likely).toHaveCount(0);
	await expect(row(page, 'Luca Widmer')).toBeVisible();
	await expect(page.getByRole('button', { name: /^Link all likely/ })).toHaveCount(0);

	await page.reload();
	await listShown(page);
	await expect(row(page, 'Timo Brunner')).toBeVisible();
	await expect(likely).toHaveCount(0);
});

test('a maybe links the face that was tapped', async ({ page }) => {
	await openFromSettings(page);
	const luca = row(page, 'Luca Widmer');
	linkedHere.push(await hrefOf(luca));

	await luca
		.getByRole('button', { name: 'Link Luca Widmer to Luca Widmer' })
		.filter({ hasText: '210 photos' })
		.click();
	await expect(page.getByTestId('immich-match-linked')).toHaveText('1 person linked.');
	await expect(luca).toHaveCount(0);
	await expect(row(page, 'Timo Brunner')).toBeVisible();

	// The face with 210 photos, not its namesake with three.
	await page.goto(linkedHere[0]);
	await expect(page.getByText('In Immich · 210 photos')).toBeVisible();
});

test('Not now puts a row aside for this visit only', async ({ page }) => {
	await openFromSettings(page);
	await row(page, 'Timo Brunner').getByRole('button', { name: 'Not now: Timo Brunner' }).click();
	await expect(row(page, 'Timo Brunner')).toHaveCount(0);
	await expect(row(page, 'Luca Widmer')).toBeVisible();

	// Nothing was kept: the next visit asks again.
	await page.reload();
	await listShown(page);
	await expect(row(page, 'Timo Brunner')).toBeVisible();
});

test('Ignore is held for the undo window, then listed under Ignored, where Propose again takes it back', async ({
	page
}) => {
	const sandra = () => row(page, 'Sandra Brunner-Keller');
	const ignoreSandra = page.getByRole('button', {
		name: 'Ignore the proposal for Sandra Brunner-Keller'
	});
	const toast = page.getByTestId('toast-undo');
	const ignored = page.getByTestId('immich-ignored');
	await openFromSettings(page);

	// Ignored, the row goes at once; Undo brings it back before anything was sent.
	await ignoreSandra.click();
	await expect(toast).toContainText('Proposal ignored');
	await expect(sandra()).toHaveCount(0);
	await toast.getByRole('button', { name: 'Undo' }).click();
	await expect(toast).toHaveCount(0);
	await expect(sandra()).toBeVisible();
	await page.reload();
	await listShown(page);
	await expect(sandra()).toBeVisible();
	await expect(ignored).toHaveCount(0);

	// Ignored again and the page left through its own link: the ignore is sent on the way out.
	await ignoreSandra.click();
	await expect(toast).toContainText('Proposal ignored');
	await openFromSettings(page);
	await expect(sandra()).toHaveCount(0);
	await expect(ignored.getByText('Ignored (1)')).toBeVisible();

	await ignored.getByText('Ignored (1)').click();
	await expect(ignored).toContainText('Sandra Brunner-Keller · In Immich: Sandra Brunner');
	await expect(ignored).toContainText(/Ignored by .+ on /);
	await ignored.getByRole('button', { name: 'Propose again: Sandra Brunner-Keller' }).click();
	await expect(toast).toContainText('Proposed again');
	await expect(ignored).toHaveCount(0);

	// Sent on the way out as well: the next visit proposes her again, and nothing is ignored.
	await openFromSettings(page);
	await expect(sandra()).toBeVisible();
	await expect(ignored).toHaveCount(0);
});

import { expect, test, type Page } from '@playwright/test';
import { addPerson, appReady, signIn } from './app';
import { photoTab } from './photo-card';

/*
 * The Photos card's suggestion (docs/02 §2.24.7, docs/design/screens/person.md): an unlinked
 * person whose full name a face in Immich carries is asked about on their own page — *Is this
 * Quirin?* — with Link, Choose another and Ignore. Written after the owner tried #313 in the
 * preview (docs/08 §8.4.1).
 *
 * The e2e server runs with `IMMICH_DEMO=true`. Every other demo face is linked by some spec at
 * some point, so this one has three of its own (`src/lib/server/immich/demo-library.ts`), named
 * like nobody in the seed: each case adds the person it is about, and a face that two people's
 * full names agree with would be a maybe — so each case has its own face.
 */

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

const hint = (page: Page) => page.getByTestId('immich-match-hint');

/** Marks the document, so a case can tell the page was not loaded again since. */
async function markDocument(page: Page): Promise<void> {
	await page.evaluate(() => {
		(window as unknown as { notReloaded?: boolean }).notReloaded = true;
	});
}
const stillSameDocument = (page: Page) =>
	page.evaluate(() => (window as unknown as { notReloaded?: boolean }).notReloaded === true);

test('a likely match is asked about on the card; Choose another opens the picker, and Link brings the photos in without a reload', async ({
	page
}) => {
	await addPerson(page, 'Quirin', 'Vorschlag');

	// It arrives under the one-line card, which stays one line.
	await expect(hint(page)).toContainText(
		'Is this Quirin? Immich has “Quirin Vorschlag” with 12 photos.'
	);
	await expect(page.locator('#section-photos')).toHaveAttribute('data-empty-line', 'true');

	await hint(page).getByRole('button', { name: 'Choose another' }).click();
	const picker = page.getByRole('dialog', { name: 'Find Quirin Vorschlag in Immich' });
	await expect(picker).toBeVisible();
	await expect(
		picker.getByRole('button', { name: 'Link Quirin Vorschlag to Quirin Vorschlag' })
	).toBeVisible();
	await picker.getByRole('button', { name: 'Close' }).click();
	await expect(picker).toBeHidden();

	await markDocument(page);
	await hint(page)
		.getByRole('button', { name: 'Link Quirin Vorschlag to Quirin Vorschlag' })
		.click();

	await expect(page.getByTestId('immich-count')).toHaveText('In Immich · 12 photos');
	await expect(photoTab(page, 'Immich')).toHaveText(/^Immich\s*12$/);
	await expect(
		page.getByTestId('photo-grid').locator('li[data-source="immich"]').first()
	).toBeVisible();
	await expect(hint(page)).toHaveCount(0);
	expect(await stillSameDocument(page)).toBe(true);
});

test('Ignore takes the row away at once, Undo brings it back, and once sent the pair is under Ignored', async ({
	page
}) => {
	await addPerson(page, 'Quilla', 'Vorschlag');
	const personPage = page.url();
	const ignore = hint(page).getByRole('button', {
		name: 'Ignore the proposal for Quilla Vorschlag'
	});
	const toast = page.getByTestId('toast-undo');
	const quilla = 'Quilla Vorschlag · In Immich: Quilla Vorschlag';

	await expect(hint(page)).toContainText('Is this Quilla?');
	await ignore.click();
	await expect(toast).toContainText('Proposal ignored');
	await expect(hint(page)).toHaveCount(0);
	await toast.getByRole('button', { name: 'Undo' }).click();
	await expect(toast).toHaveCount(0);
	await expect(hint(page)).toBeVisible();

	// Ignored again and the page left through the app: the ignore is sent on the way out.
	await ignore.click();
	await expect(toast).toContainText('Proposal ignored');
	const sent = page.waitForResponse(
		(response) =>
			response.url().includes('?/ignoreImmichMatch') && response.request().method() === 'POST'
	);
	await page.getByRole('link', { name: 'Settings' }).first().click();
	expect((await sent).ok()).toBe(true);

	await page.goto('/settings/immich');
	const ignored = page.getByTestId('immich-ignored');
	await ignored.getByText(/^Ignored \(\d+\)$/).click();
	await expect(ignored).toContainText(quilla);

	// Proposed again, so the household's ignores are as the other specs expect them.
	await ignored.getByRole('button', { name: 'Propose again: Quilla Vorschlag' }).click();
	await expect(toast).toContainText('Proposed again');
	const proposed = page.waitForResponse(
		(response) =>
			response.url().includes('?/proposeAgain') && response.request().method() === 'POST'
	);
	await page.getByRole('link', { name: 'Settings' }).first().click();
	expect((await proposed).ok()).toBe(true);

	// And the card asks again.
	await page.goto(personPage);
	await appReady(page);
	await expect(hint(page)).toContainText('Is this Quilla?');
});

test('a maybe is not asked about on the card — it stays in Settings', async ({ page }) => {
	// Half of a double last name agrees: a maybe, as in the list.
	const asked = page.waitForResponse((response) => response.url().endsWith('/immich/match'));
	await addPerson(page, 'Quella', 'Vorschlag-Probe');

	// The answer is in, and it is "nothing to suggest"; the card is drawn.
	expect(await (await asked).json()).toEqual({ match: null });
	await expect(page.locator('#section-photos').getByText('No photos yet.')).toBeVisible();
	await expect(hint(page)).toHaveCount(0);

	await page.goto('/settings/immich');
	const row = page.getByTestId('immich-match').filter({ hasText: 'Quella Vorschlag-Probe' });
	await expect(row).toHaveAttribute('data-kind', 'maybe');
});

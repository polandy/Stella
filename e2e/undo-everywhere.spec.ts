import { expect, test, type Page } from '@playwright/test';
import { openPerson, signIn } from './app';

/*
 * Undo for the leaf records, and the *Saved* toast (docs/02 §2.23, docs/05 §5.7). Written
 * after the flows were seen in the running app (docs/08 §8.4.1). `e2e/undo.spec.ts` covers a
 * story item; this covers what the second PR added — a tag, and a circle membership.
 *
 * Everything removed here is created by the test itself, on a person and a tag name the seed
 * does not use, so no other case's counts move.
 */

const PERSON = /Nicole Frei/;
// The seed gives nobody a tag, so each case starts from "No tags yet." and owns the one it
// adds. Two names, so neither case can pass on what the other left behind.
const TAG_TAKEN_BACK = 'Zzz-undo-tag';
const TAG_LET_GO = 'Zzz-sent-tag';

/** The profile-column section with this title, e.g. Tags. */
function section(page: Page, title: string) {
	return page.locator('section', { has: page.getByText(title, { exact: true }) }).first();
}

/** Adds a tag through the section's own form and waits for it to be on the page. */
async function addTag(page: Page, name: string): Promise<void> {
	const tags = section(page, 'Tags');
	await tags.getByRole('button', { name: 'Add' }).click();
	await tags.getByPlaceholder('Tag name').fill(name);
	await tags.getByRole('button', { name: 'Add', exact: true }).last().click();
	await expect(tags).toContainText(name);
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('saving a tag says Saved and closes the form, and removing it takes the count with it', async ({
	page
}) => {
	await openPerson(page, PERSON);
	const tags = section(page, 'Tags');
	await expect(tags).toContainText('No tags yet.'); // the seed gives nobody a tag

	await tags.getByRole('button', { name: 'Add' }).click();
	await tags.getByPlaceholder('Tag name').fill(TAG_TAKEN_BACK);
	await tags.getByRole('button', { name: 'Add', exact: true }).last().click();

	// The save is reported where every save is reported, and the editor puts itself away.
	await expect(page.getByTestId('toast-notice')).toContainText('Saved');
	await expect(tags.getByPlaceholder('Tag name')).toHaveCount(0);
	await expect(tags).toContainText(TAG_TAKEN_BACK);
	await expect(tags).toContainText('1');

	// Removing: the chip goes at once, the count follows it, and the section says it is empty
	// rather than showing a list with nothing in it.
	await page.getByRole('button', { name: `Remove tag ${TAG_TAKEN_BACK}` }).click();
	await expect(tags).not.toContainText(TAG_TAKEN_BACK);
	await expect(tags).toContainText('0');
	await expect(tags).toContainText('No tags yet.');
	const toast = page.getByTestId('toast-undo');
	await expect(toast).toContainText('Tag removed');

	// Undo puts it back, and a reload proves nothing was ever sent.
	await toast.getByRole('button', { name: 'Undo' }).click();
	await expect(toast).toHaveCount(0);
	await expect(tags).toContainText(TAG_TAKEN_BACK);
	await page.reload();
	await expect(section(page, 'Tags')).toContainText(TAG_TAKEN_BACK);
});

test('a removal left alone is sent when the page is left, and the tag is gone for good', async ({
	page
}) => {
	await openPerson(page, PERSON);
	await addTag(page, TAG_LET_GO);

	await page.getByRole('button', { name: `Remove tag ${TAG_LET_GO}` }).click();
	await expect(page.getByTestId('toast-undo')).toBeVisible();

	// Leaving commits it: the next screen loads with the removal already sent.
	await openPerson(page, PERSON);
	await expect(page.getByTestId('toast-undo')).toHaveCount(0);
	await expect(section(page, 'Tags')).not.toContainText(TAG_LET_GO);
	await page.reload();
	await expect(section(page, 'Tags')).not.toContainText(TAG_LET_GO);
});

test('a member removed from a circle leaves the grid and comes back with Undo', async ({ page }) => {
	await page.goto('/circles');
	await page.getByTestId('circle-cards').getByRole('link', { name: /Turnverein/ }).click();
	const members = page.getByTestId('member-grid');
	const heading = section(page, 'Members');
	await expect(members.getByRole('link', { name: 'Beat Steiner' })).toBeVisible();
	await expect(heading).toContainText('4');

	await page.getByRole('button', { name: 'Remove Beat Steiner from circle' }).click();
	await expect(members.getByRole('link', { name: 'Beat Steiner' })).toHaveCount(0);
	await expect(heading).toContainText('3');
	const toast = page.getByTestId('toast-undo');
	await expect(toast).toContainText('Removed from the circle');

	// Taken back before the window closes: the grid, the count and the database are unchanged.
	await toast.getByRole('button', { name: 'Undo' }).click();
	await expect(members.getByRole('link', { name: 'Beat Steiner' })).toBeVisible();
	await expect(heading).toContainText('4');
	await page.reload();
	await expect(page.getByTestId('member-grid').getByRole('link', { name: 'Beat Steiner' })).toBeVisible();
});

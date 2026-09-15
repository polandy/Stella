import { expect, test, type Page } from '@playwright/test';
import { addPerson, addTag, openPerson, profileRow, signIn } from './app';

/*
 * A tag lives exactly as long as someone carries it (docs/02 §2.8). There is no screen to
 * delete one from — a tag is created by naming it on a person — so the only way to be rid of
 * one is to take it off the last carrier, or to delete that carrier outright. Both halves end
 * at the same place: the household's chip row above the people list, which must not keep a
 * chip that leads to an empty page. Written after the maintainer verified the flow in the
 * running app (docs/08 §8.4.1).
 *
 * The suite shares one demo database, so every person and tag here is invented: the Okonkwos
 * are in no seed and no other spec, and the tag names are prefixed so they cannot collide with
 * the ones `undo-everywhere.spec.ts` owns. The seed gives nobody a tag, so the chip row starts
 * empty and these cases own every chip they assert on.
 */

/** The household's tag chip above the people list — a filter link named for the tag. */
const chip = (page: Page, name: string) => page.getByRole('link', { name, exact: true });

/**
 * Takes a tag off the person whose page is open. The removal is deferred behind the undo
 * toast (docs/02 §2.23), so it is not sent yet when this returns — leaving the page is what
 * commits it, which is the seam every undo case uses instead of waiting on the window.
 */
async function removeTag(page: Page, name: string): Promise<void> {
	const tags = await profileRow(page, 'Tags');
	await page.getByRole('button', { name: `Remove tag ${name}` }).click();
	await expect(tags).not.toContainText(name);
	await expect(page.getByTestId('toast-undo')).toBeVisible();
}

/** Deletes the open person for good, through the two steps the page asks for. */
async function deleteForGood(page: Page, who: string): Promise<void> {
	await page.getByRole('button', { name: 'Delete for good' }).click();
	await page.getByRole('button', { name: `Delete ${who}` }).click();
	await expect(page.getByRole('heading', { name: 'People' })).toBeVisible();
}

const LONE_CARRIER = 'Tamsin Okonkwo';
const LONE_TAG = 'Zzz-lone-badge';
const SHARED_TAG = 'Zzz-shared-crew';
const FIRST_OF_TWO = 'Rufus Okonkwo';
const LAST_OF_TWO = 'Marisol Okonkwo';

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('the chip goes with the last person carrying it when they are deleted', async ({ page }) => {
	await addPerson(page, 'Tamsin', 'Okonkwo');
	await addTag(page, LONE_TAG);

	// The positive control: while she carries it, the tag really is in the chip row — so the
	// assertion after the delete is about the tag going, not about the row never showing it.
	await page.goto('/contacts');
	await expect(chip(page, LONE_TAG)).toBeVisible();

	await openPerson(page, new RegExp(LONE_CARRIER));
	await deleteForGood(page, LONE_CARRIER);

	// Her assignments went by cascade rather than through the use-case, so the tag is swept up
	// after the delete — otherwise this chip would sit here forever, filtering to nobody.
	await expect(chip(page, LONE_TAG)).toHaveCount(0);
	await page.reload();
	await expect(chip(page, LONE_TAG)).toHaveCount(0);
});

test('a tag still on someone else survives, and goes only with the last carrier', async ({
	page
}) => {
	await addPerson(page, 'Rufus', 'Okonkwo');
	await addTag(page, SHARED_TAG);
	await addPerson(page, 'Marisol', 'Okonkwo');
	await addTag(page, SHARED_TAG); // the same name is the same tag, not a second one

	await page.goto('/contacts');
	await expect(chip(page, SHARED_TAG)).toBeVisible();

	// Taken off one of the two: still carried, so the chip stays. This is what stops the
	// delete-when-empty rule from firing on every removal.
	await openPerson(page, new RegExp(FIRST_OF_TWO));
	await removeTag(page, SHARED_TAG);
	await page.goto('/contacts'); // leaving sends the deferred removal
	await expect(chip(page, SHARED_TAG)).toBeVisible();

	// Taken off the last one: nobody carries it, so the tag itself goes.
	await openPerson(page, new RegExp(LAST_OF_TWO));
	await removeTag(page, SHARED_TAG);
	await page.goto('/contacts');
	await expect(chip(page, SHARED_TAG)).toHaveCount(0);
	await page.reload();
	await expect(chip(page, SHARED_TAG)).toHaveCount(0);
});

import { expect, test, type Locator, type Page } from '@playwright/test';
import { addPerson, addTag, openPeople, openPerson, profileRow, signIn } from './app';

/*
 * A tag lives exactly as long as someone carries it (docs/02 §2.8). There is no screen to
 * delete one from — a tag is created by naming it on a person — so the only ways one ever goes
 * are the last carrier putting it down, or that carrier being deleted outright. Both halves
 * end at the same place: the household's chip row above the people list, which must not keep a
 * chip that leads to an empty page. Written after the maintainer verified the flow in the
 * running app (docs/08 §8.4.1).
 *
 * Every assertion that a chip is *gone* is paired with a chip that must still be there
 * (`KEEPER_TAG`). Without that pair the absence holds just as well when the row never rendered
 * at all, which is how the first attempt at the second case came to pass together with its own
 * inverse (#101): it read a link by accessible name anywhere on the page, and a page between
 * renders has no such link whatever the database says. The row is addressed by `data-testid`
 * for the same reason.
 *
 * The suite shares one demo database, so every person and tag here is invented: the Okonkwos
 * are in no seed and no other spec, and the tag names are prefixed so they cannot collide with
 * the ones `undo-everywhere.spec.ts` owns.
 */

/** The household's tag chip row above the people list. */
const chipRow = (page: Page): Locator => page.getByTestId('tag-chips');

/** One tag's filter chip inside that row. */
const chip = (page: Page, name: string): Locator =>
	chipRow(page).getByRole('link', { name, exact: true });

/**
 * Takes a tag off the person whose page is open. The removal is deferred behind the undo
 * toast (docs/02 §2.23), so it is not sent yet when this returns; `openPeople` is what commits
 * it, by navigating client-side. Never wait on the undo window instead — it would be a race.
 */
async function removeTag(page: Page, name: string): Promise<void> {
	const tags = await profileRow(page, 'Tags');
	await page.getByRole('button', { name: `Remove tag ${name}` }).click();
	await expect(tags).not.toContainText(name);
	await expect(page.getByTestId('toast-undo')).toBeVisible();
}

/**
 * Reopens the person and reads their Tags row from a fresh server render. This is the positive
 * signal that a deferred removal actually landed: a chip missing from the household row could
 * otherwise mean the request was never sent.
 */
async function reloadedTags(page: Page, who: string): Promise<Locator> {
	await openPerson(page, new RegExp(who));
	await page.reload();
	return profileRow(page, 'Tags');
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
const KEEPER_TAG = 'Zzz-keeper-crew';
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
	await openPeople(page);
	await expect(chip(page, LONE_TAG)).toBeVisible();

	await openPerson(page, new RegExp(LONE_CARRIER));
	await deleteForGood(page, LONE_CARRIER);

	// Her assignments went by cascade rather than through the use-case, so the tag is swept up
	// after the delete — otherwise this chip would sit here forever, filtering to nobody.
	await expect(chipRow(page)).toBeVisible();
	await expect(chip(page, LONE_TAG)).toHaveCount(0);
	await page.reload();
	await expect(chipRow(page)).toBeVisible();
	await expect(chip(page, LONE_TAG)).toHaveCount(0);
});

test('a tag still on someone else survives, and goes only with the last carrier', async ({
	page
}) => {
	await addPerson(page, 'Rufus', 'Okonkwo');
	await addTag(page, SHARED_TAG);
	await addPerson(page, 'Marisol', 'Okonkwo');
	await addTag(page, SHARED_TAG); // the same name is the same tag, not a second one
	// Nobody ever takes this one off, so its chip is on the row in every render below. It is
	// what the assertions about the other chip's absence are read against: a row that shows
	// the keeper is a row that was rendered from a load, not one caught mid-navigation.
	await addTag(page, KEEPER_TAG);

	await openPeople(page);
	await expect(chip(page, KEEPER_TAG)).toBeVisible();
	await expect(chip(page, SHARED_TAG)).toBeVisible();

	// Taken off one of the two. The removal really landed — his page says so after a reload,
	// which is the positive signal the next assertion needs: without it, a chip still on the
	// screen could just as well mean the removal was never sent.
	await openPerson(page, new RegExp(FIRST_OF_TWO));
	await removeTag(page, SHARED_TAG);
	const rufusTags = await reloadedTags(page, FIRST_OF_TWO);
	await expect(rufusTags).toContainText('No tags yet.');
	await expect(rufusTags).not.toContainText(SHARED_TAG);

	// He has let it go and it is still carried by her, so the chip stays. This is what stops
	// the delete-when-empty rule from firing on every removal.
	await openPeople(page);
	await expect(chip(page, KEEPER_TAG)).toBeVisible();
	await expect(chip(page, SHARED_TAG)).toBeVisible();

	// Taken off the last one: nobody carries it, so the tag itself goes.
	await openPerson(page, new RegExp(LAST_OF_TWO));
	await removeTag(page, SHARED_TAG);
	const marisolTags = await reloadedTags(page, LAST_OF_TWO);
	await expect(marisolTags).toContainText(KEEPER_TAG);
	await expect(marisolTags).not.toContainText(SHARED_TAG);

	await openPeople(page);
	await expect(chip(page, KEEPER_TAG)).toBeVisible();
	await expect(chip(page, SHARED_TAG)).toHaveCount(0);
	await page.reload();
	await expect(chip(page, KEEPER_TAG)).toBeVisible();
	await expect(chip(page, SHARED_TAG)).toHaveCount(0);
});

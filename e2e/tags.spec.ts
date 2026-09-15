import { expect, test, type Page } from '@playwright/test';
import { addPerson, addTag, openPeople, openPerson, signIn } from './app';

/*
 * A tag lives exactly as long as someone carries it (docs/02 §2.8). There is no screen to
 * delete one from — a tag is created by naming it on a person — so the last carrier leaving is
 * the only way one ever goes. This covers the half that is otherwise untested: a deleted
 * contact takes its assignments by cascade rather than through `unassignTag`, so the tags it
 * was the last carrier of are swept up afterwards by the route. Dropping that sweep keeps
 * every unit and integration test green, and only this case goes red.
 *
 * The last-unassign half is covered at the layer that can actually discriminate it —
 * `domain/tags/tags.test.ts` and `db/tag-repository.test.ts`. An e2e for it was written and
 * withdrawn: see the PR discussion for why its green meant nothing.
 *
 * The suite shares one demo database, so everyone here is invented — Tamsin Okonkwo is in no
 * seed and no other spec, and the tag name is prefixed so it cannot collide with the ones
 * `undo-everywhere.spec.ts` owns. The seed gives nobody a tag. Written after the maintainer
 * verified the flow in the running app (docs/08 §8.4.1).
 */

/** The household's tag chip above the people list — a filter link named for the tag. */
const chip = (page: Page, name: string) => page.getByRole('link', { name, exact: true });

/** Deletes the open person for good, through the two steps the page asks for. */
async function deleteForGood(page: Page, who: string): Promise<void> {
	await page.getByRole('button', { name: 'Delete for good' }).click();
	await page.getByRole('button', { name: `Delete ${who}` }).click();
	await expect(page.getByRole('heading', { name: 'People' })).toBeVisible();
}

const LONE_CARRIER = 'Tamsin Okonkwo';
const LONE_TAG = 'Zzz-lone-badge';

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
	await expect(chip(page, LONE_TAG)).toHaveCount(0);
	await page.reload();
	await expect(chip(page, LONE_TAG)).toHaveCount(0);
});

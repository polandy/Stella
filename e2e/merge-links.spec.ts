import { expect, test, type Page } from '@playwright/test';
import { appReady, pickPerson, recordAction, signIn } from './app';
import { LINK, personIdOf, seedHousehold } from './seed';

/*
 * What a merge does to links both records had (docs/02 §2.2, docs/03 §relationship). Written
 * after the owner verified the flow in the running app (docs/08 §8.4.1).
 *
 * The ids follow the names (`e2e-agnes-…` < `e2e-mauro-…`, `e2e-nina-…` < `e2e-zilla-…`), so
 * the third people sort between the record merged away and the survivor — the case in which a
 * column-by-column repoint left a link that holds both ways unsorted. Every name here is
 * absent from the demo seed and from every other spec.
 */

const survivor = 'Zilla Vonrufs';
const merged = 'Agnes Vonrufs';
const both = 'Mauro Gubler';
const theirs = 'Nina Allenspach';

async function openSeeded(page: Page, name: string): Promise<void> {
	await page.goto(`/contacts/${personIdOf(name)}`);
	await expect(page.getByRole('heading', { name })).toBeVisible();
	await appReady(page);
}

const storedRow = (page: Page, name: string) =>
	page.getByTestId('relationship-list').locator('li').filter({ hasText: name });

async function addFriend(page: Page, person: string): Promise<void> {
	await page.getByRole('button', { name: 'Add relationship' }).click();
	const form = page.locator('form[action="?/addRelationship"]');
	await form.locator('select[name=typeChoice]').selectOption({ label: 'Friend of' });
	await pickPerson(form.getByLabel('Person'), person);
	await form.getByRole('button', { name: 'Add', exact: true }).click();
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('folds a link both records had into one, and refuses it again from either end', async ({
	page
}) => {
	await seedHousehold(
		page,
		[survivor, merged, both, theirs],
		// Each symmetric link is seeded in the order the app stores it in, so the setting reads the
		// same whether or not the restore would have turned it round.
		[
			{ from: both, to: survivor, type: LINK.friendOf },
			{ from: merged, to: both, type: LINK.friendOf },
			{ from: merged, to: theirs, type: LINK.friendOf }
		]
	);
	await openSeeded(page, survivor);

	await recordAction(page, 'Merge someone into this person');
	const form = page.locator('form[action="?/merge"]');
	await pickPerson(form.getByLabel('Who is the same person?'), merged);
	await form.getByRole('button', { name: `Merge into ${survivor}` }).click();
	await expect(page.getByTestId('record-confirm')).toHaveCount(0);

	// The link only the merged record had is there — the neighbour that says the list is the
	// settled one — and the link both had is there once.
	await openSeeded(page, survivor);
	await expect(storedRow(page, theirs)).toHaveCount(1);
	await expect(storedRow(page, both)).toHaveCount(1);

	// Adding it again is refused, from the survivor's page and from the other end.
	await addFriend(page, both);
	await expect(page.locator('#section-relationships')).toContainText(
		'That relationship already exists.'
	);
	await openSeeded(page, survivor);
	await expect(storedRow(page, both)).toHaveCount(1);

	await openSeeded(page, theirs);
	await expect(storedRow(page, survivor)).toHaveCount(1);
	await addFriend(page, survivor);
	await expect(page.locator('#section-relationships')).toContainText(
		'That relationship already exists.'
	);
	await openSeeded(page, theirs);
	await expect(storedRow(page, survivor)).toHaveCount(1);
});

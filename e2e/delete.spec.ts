import { expect, test, type Page } from '@playwright/test';
import { appReady, mention, openPerson, signIn } from './app';

/*
 * Removing a person for good (docs/02 §2.2). Written after the flow was verified in the
 * running app (docs/08 §8.4.1).
 *
 * The suite shares one demo database, so these cases invent the person they delete rather
 * than taking one of the Brunners with them — Ophelia Trask is in no other spec and in no
 * seed. The demo user is the household admin; a member's view of this is enforced by
 * `requireAdmin` at the edge and has no second account to be driven from.
 */

const WHO = 'Ophelia Trask';

/** Adds a person through the real form and lands on their page. */
async function addPerson(page: Page, first: string, last: string): Promise<void> {
	await page.goto('/contacts/new');
	await page.getByLabel('First name').fill(first);
	await page.getByLabel('Last name').fill(last);
	await page.getByRole('button', { name: 'Add person' }).click();
	await expect(page.getByRole('heading', { name: `${first} ${last}` })).toBeVisible();
	await appReady(page);
}

const deleteDisclosure = (page: Page) => page.getByRole('button', { name: 'Delete for good' });

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('asks a second time, and the first click alone deletes nothing', async ({ page }) => {
	await addPerson(page, 'Ophelia', 'Trask');

	await deleteDisclosure(page).click();
	await expect(page.getByRole('button', { name: `Delete ${WHO}` })).toBeVisible();

	// Still there: the disclosure only says what would happen.
	await page.reload();
	await expect(page.getByRole('heading', { name: WHO })).toBeVisible();

	// And it can be taken back without deleting anything.
	await deleteDisclosure(page).click();
	await page.getByRole('button', { name: 'Keep them' }).click();
	await expect(page.getByRole('button', { name: `Delete ${WHO}` })).toHaveCount(0);
	await expect(page.getByRole('heading', { name: WHO })).toBeVisible();
});

test('takes the person and everything written about them, and tells the household', async ({ page }) => {
	// A moment about them, so there is something of theirs in the stream to lose.
	await page.getByLabel('What happened?').pressSequentially('walked the dog with ');
	await mention(page, 'Ophelia', new RegExp(WHO));
	await page.getByRole('button', { name: /^Save/ }).click();
	await expect(page.locator('article').first()).toContainText('walked the dog with');

	await openPerson(page, new RegExp(WHO));
	await deleteDisclosure(page).click();
	await page.getByRole('button', { name: `Delete ${WHO}` }).click();

	// Gone from the directory it lands on, and from the search.
	await expect(page.getByRole('heading', { name: 'People' })).toBeVisible();
	await expect(page.getByTestId('people-directory')).not.toContainText(WHO);
	await page.keyboard.press('Control+k');
	const palette = page.getByRole('dialog', { name: 'Jump to' });
	await page.keyboard.type('Ophelia');
	await expect(palette.getByRole('option', { name: new RegExp(WHO) })).toHaveCount(0);
	await page.keyboard.press('Escape');

	// The moment went with them — and the household is told, which is the only trace left.
	await page.getByRole('link', { name: 'Home' }).first().click();
	await expect(page.getByRole('heading', { name: 'What happened?' })).toBeVisible();
	await expect(page.locator('ol')).not.toContainText('walked the dog with');
	await expect(page.locator('article').filter({ hasText: `removed ${WHO}` })).toHaveCount(1);
});

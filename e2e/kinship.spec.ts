import { expect, test, type Page } from '@playwright/test';
import { openPerson, pickPerson, signIn } from './app';

/*
 * Derived kinship and propagation suggestions (docs/02 §2.4.1). Written after the flow was
 * verified in the running app (docs/08 §8.4.1). Runs against the demo dataset, whose
 * Brunner/Keller family carries three generations, as the demo admin.
 */

/*
 * Opens a person and their People tab. Going through `openPerson` waits for the shell to be
 * interactive first: the section's *Add relationship* disclosure is a JavaScript control and
 * answers nothing before that.
 */
async function openPeopleTab(page: Page, name: RegExp): Promise<void> {
	await openPerson(page, name);
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('names the relatives nobody entered, saying who each comes through', async ({ page }) => {
	await openPeopleTab(page, /Lena Brunner/);
	const derived = page.getByTestId('derived-kin');

	// Lena's mother is Sandra Brunner-Keller, whose mother is Ursula: a grandmother nobody
	// wrote down, named through the person she comes through.
	await expect(derived).toContainText('Grandmother');
	await expect(derived).toContainText('Ursula Keller-Marti');
	await expect(derived).toContainText('via Sandra Brunner-Keller');
	// Sandra's sister and Markus's brother, and the brother's child one step further out.
	await expect(derived).toContainText('Aunt');
	await expect(derived).toContainText('Corinne Keller');
	await expect(derived).toContainText('Uncle');
	await expect(derived).toContainText('Daniel Brunner');
	await expect(derived).toContainText('Cousin');
	await expect(derived).toContainText('Timo Brunner');

	// What the household entered keeps its own wording and is never inferred a second time:
	// Hans is a stored grandparent, so he appears above and not among the derived.
	await expect(page.locator('#section-relationships').getByText('Grandchild of').first()).toBeVisible();
	await expect(derived).not.toContainText('Hans Brunner');
});

test('says nothing it cannot back: no derived relatives for someone with no family links', async ({ page }) => {
	await openPeopleTab(page, /Beat Steiner/);
	await expect(page.getByTestId('derived-kin')).toHaveCount(0);
});

test('offers the links a new parent implies, and writes only the one confirmed', async ({ page }) => {
	await openPeopleTab(page, /Vreni Zbinden/);
	await page.getByRole('button', { name: 'Add relationship' }).click();
	const editor = page.locator('form[action="?/addRelationship"]');
	await editor.locator('select[name=typeChoice]').selectOption({ label: 'Parent of' });
	await pickPerson(editor.getByLabel('Person'), 'Lena Brunner');
	await editor.getByRole('button', { name: 'Add', exact: true }).click();

	// Lena's brothers follow from it, each with the reason and its own confirmation.
	const proposals = page.getByTestId('kin-proposals');
	await expect(proposals).toContainText('Vreni Zbinden is a parent of Elias Brunner');
	await expect(proposals).toContainText('Elias Brunner is Lena Brunner’s sibling.');
	await expect(proposals).toContainText('Vreni Zbinden is a parent of Noah Brunner');

	await proposals
		.getByTestId('kin-suggestion')
		.filter({ hasText: 'Elias Brunner' })
		.getByRole('button', { name: 'Accept' })
		.click();

	/*
	 * Held rather than written (docs/02 §2.23): the confirmed row keeps its place for one undo
	 * window while the untouched one stays exactly as it was. Confirming used to reload the page,
	 * which is what made the block jump away under the reader.
	 */
	const rowFor = (name: string) =>
		page.getByTestId('kin-proposals').getByTestId('kin-suggestion').filter({ hasText: name });
	await expect(rowFor('Elias Brunner')).toHaveAttribute('data-held', 'accept');
	await expect(rowFor('Noah Brunner')).not.toHaveAttribute('data-held');
	await expect(page.getByTestId('toast-undo')).toBeVisible();

	// Leaving closes the window and sends it — and exactly the confirmed one was written.
	await openPeopleTab(page, /Vreni Zbinden/);
	const stored = page.locator('#section-relationships ul').first();
	await expect(stored).toContainText('Elias Brunner');
	await expect(stored).not.toContainText('Noah Brunner');
});

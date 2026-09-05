import { expect, test, type Page } from '@playwright/test';

/*
 * Derived kinship and propagation suggestions (docs/02 §2.4.1). Written after the flow was
 * verified in the running app (docs/08 §8.4.1). Runs against the demo dataset, whose
 * Brunner/Keller family carries three generations, as the demo admin.
 */

/** Signs in through the SEED_DEMO one-click button and lands on Home. */
async function signIn(page: Page): Promise<void> {
	await page.goto('/login');
	await page.getByRole('button', { name: 'Sign in as demo user' }).click();
	await expect(page.getByRole('heading', { name: 'What happened?' })).toBeVisible();
}

/** Opens a person from the directory and shows the People tab. */
async function openPeopleTab(page: Page, name: RegExp): Promise<void> {
	await page.goto('/contacts');
	await page.getByRole('link', { name }).first().click();
	await page.getByRole('tab', { name: /People/ }).click();
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
	await expect(page.locator('#panel-people').getByText('Grandchild of').first()).toBeVisible();
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
	await editor.locator('select[name=typeId]').selectOption({ label: 'Parent of' });
	await editor.locator('select[name=targetId]').selectOption({ label: 'Lena Brunner' });
	await editor.getByRole('button', { name: 'Add', exact: true }).click();

	// Lena's brothers follow from it, each with the reason and its own confirmation.
	const proposals = page.getByTestId('kin-proposals');
	await expect(proposals).toContainText('Vreni Zbinden is a parent of Elias Brunner');
	await expect(proposals).toContainText('Elias Brunner is Lena Brunner’s sibling.');
	await expect(proposals).toContainText('Vreni Zbinden is a parent of Noah Brunner');

	await proposals
		.locator('form')
		.filter({ hasText: 'Elias Brunner' })
		.getByRole('button', { name: 'Add this too' })
		.click();

	// Exactly the confirmed one was written: Elias is now stored, Noah is still only offered.
	await expect(page.getByTestId('kin-proposals')).not.toContainText('Elias Brunner');
	await expect(page.getByTestId('kin-proposals')).toContainText('Noah Brunner');
	const stored = page.locator('#panel-people ul').first();
	await expect(stored).toContainText('Elias Brunner');
	await expect(stored).not.toContainText('Noah Brunner');
});

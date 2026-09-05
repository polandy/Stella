import { expect, test, type Page } from '@playwright/test';

/*
 * Duplicate & relative suggestions in quick-add (docs/02 §2.2.1). Written after the flow
 * was verified in the running app (docs/08 §8.4.1). Runs against the demo dataset as the
 * demo admin; the people added here carry a first name (Quill) no seeded person uses.
 */

/** Signs in through the SEED_DEMO one-click button and lands on Home. */
async function signIn(page: Page): Promise<void> {
	await page.goto('/login');
	await page.getByRole('button', { name: 'Sign in as demo user' }).click();
	await expect(page.getByRole('heading', { name: 'What happened?' })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
	await page.goto('/contacts/new');
});

test('shows nobody until a surname is typed, then the same and similar surnames with the reason', async ({ page }) => {
	await page.getByLabel('First name').fill('Quill');
	await page.getByLabel('First name').blur();
	await expect(page.getByTestId('name-suggestions')).toHaveCount(0);

	// One typo away: every Brunner is "similar", the compound surname included.
	await page.getByLabel('Last name').fill('Bruner');
	await page.getByLabel('Last name').blur();
	const box = page.getByTestId('name-suggestions');
	await expect(box).toContainText('Already in Stella?');
	await expect(box).toContainText('Lena Brunner');
	await expect(box).toContainText('Sandra Brunner-Keller');
	await expect(box).toContainText('Similar surname');
	await expect(box).not.toContainText('Same surname');

	// The exact surname is a stronger reason, and the reason text changes with it.
	await page.getByLabel('Last name').fill('brünner');
	await page.getByLabel('Last name').blur();
	await expect(box).toContainText('Same surname');
	await expect(box).not.toContainText('Similar surname');
	await expect(box.getByRole('link', { name: 'Lena Brunner' })).toHaveAttribute('href', /\/contacts\//);
});

test('puts an exact full-name match first as the likely duplicate', async ({ page }) => {
	await page.getByLabel('First name').fill('Lena');
	await page.getByLabel('Last name').fill('Brunner');
	await page.getByLabel('Last name').blur();
	const rows = page.getByTestId('name-suggestions').getByRole('listitem');
	await expect(rows.first()).toContainText('Lena Brunner');
	await expect(rows.first()).toContainText('Same name — is this them?');
	await expect(rows.nth(1)).toContainText('Same surname');
});

test('link as relative creates the person and opens their relationship editor with the relative chosen', async ({ page }) => {
	await page.getByLabel('First name').fill('Quill');
	await page.getByLabel('Last name').fill('Brunner');
	await page.getByLabel('Last name').blur();
	const box = page.getByTestId('name-suggestions');
	await box.getByRole('listitem').filter({ hasText: 'Lena Brunner' }).getByRole('radio', { name: 'Link as relative' }).check();
	await expect(box).toContainText('After adding, you land in the relationship editor');
	await page.getByRole('button', { name: 'Add person' }).click();

	await expect(page.getByRole('heading', { name: 'Quill Brunner' })).toBeVisible();
	await expect(page.getByRole('tab', { name: /People/ })).toHaveAttribute('aria-selected', 'true');
	const target = page.locator('select[name=targetId]');
	await expect(target).toBeVisible();
	await expect(target.locator('option:checked')).toHaveText(/Lena Brunner/);

	// The hand-off ends in a real relationship, listed on the new person's page.
	const editor = page.locator('form[action="?/addRelationship"]');
	await editor.locator('select[name=typeId]').selectOption({ label: 'Sibling of' });
	await editor.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByRole('tab', { name: /People/ })).toContainText('1');
	await page.getByRole('tab', { name: /People/ }).click();
	await expect(page.getByRole('link', { name: 'Lena Brunner' })).toBeVisible();
});

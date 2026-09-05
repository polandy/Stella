import { expect, test, type Page } from '@playwright/test';

/*
 * Circles as cards and a member grid (docs/02 §2.4.2, docs/05 §5.5). Written after the
 * screens were seen in the running app (docs/08 §8.4.1). Runs against the demo dataset,
 * signed in as the demo admin; the circle created here (Quill Choir) is absent from the seed.
 */

/** Signs in through the SEED_DEMO one-click button and lands on Home. */
async function signIn(page: Page): Promise<void> {
	await page.goto('/login');
	await page.getByRole('button', { name: 'Sign in as demo user' }).click();
	await expect(page.getByRole('heading', { name: 'What happened?' })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('shows a circle as a card with the first faces and how many more there are', async ({ page }) => {
	await page.goto('/circles');
	const card = page.getByTestId('circle-cards').getByRole('link', { name: /Familien-Freunde/ });

	// Six members, four faces on the card, the rest as a number.
	await expect(card).toContainText('6 members');
	await expect(card.getByRole('img')).toHaveCount(0); // seed has no photos: initials only
	await expect(card).toContainText('+2');
});

test('opens a circle, adds a member from the card’s own disclosure and shows them in the grid', async ({ page }) => {
	await page.goto('/circles');
	await page.getByTestId('circle-cards').getByRole('link', { name: /Musikschule/ }).click();
	await expect(page.getByRole('heading', { name: /Musikschule/ })).toBeVisible();

	const grid = page.getByTestId('member-grid');
	await expect(grid.getByRole('link', { name: 'Lena Brunner' })).toBeVisible();
	await expect(grid.getByRole('link', { name: 'Noah Brunner' })).toHaveCount(0);

	await page.getByRole('button', { name: 'Add member' }).click();
	const form = page.locator('form[action="?/addMember"]');
	await form.getByLabel('Person').selectOption({ label: 'Noah Brunner' });
	await form.getByLabel('Role (optional)').fill('Blockflöte');
	await form.getByRole('button', { name: 'Add', exact: true }).click();

	await expect(grid.getByRole('link', { name: 'Noah Brunner' })).toBeVisible();
	await expect(grid.getByText('Blockflöte')).toBeVisible();
});

test('a new circle starts with an invitation rather than an empty list', async ({ page }) => {
	await page.goto('/circles');
	await page.getByRole('button', { name: 'New circle' }).click();
	await page.getByLabel('Name').fill('Quill Choir');
	await page.getByRole('button', { name: 'Create circle' }).click();

	await expect(page.getByRole('heading', { name: 'Quill Choir' })).toBeVisible();
	await expect(page.getByText('Nobody in this circle yet')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Add member' })).toBeVisible();
});

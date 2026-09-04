import { expect, test, type Page } from '@playwright/test';

/*
 * Moments capture and the household stream (docs/02 §2.22). Written after the flow was
 * verified in the running app (docs/08 §8.4.1). The suite runs against a fresh database
 * seeded with the demo dataset, signed in as the demo admin.
 *
 * People invented here (Zelda, Yorick, Quill) are deliberately absent from the demo dataset,
 * so the "Create …" path never collides with a seeded contact.
 */

/** Signs in through the SEED_DEMO one-click button and lands on Home. */
async function signIn(page: Page): Promise<void> {
	await page.goto('/login');
	await page.getByRole('button', { name: 'Sign in as demo user' }).click();
	await expect(page.getByRole('heading', { name: 'What happened?' })).toBeVisible();
}

/** Types `@query` and picks the suggestion whose label matches. */
async function mention(page: Page, query: string, label: RegExp): Promise<void> {
	await page.getByLabel('What happened?').pressSequentially(`@${query}`);
	await page.getByRole('option', { name: label }).click();
}

const composerSave = (page: Page) => page.getByRole('button', { name: /^Save/ });

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('captures a moment on an existing person and shows it in the stream', async ({ page }) => {
	await mention(page, 'Lena', /Lena Brunner/);
	await page.getByLabel('What happened?').pressSequentially('played the piano piece all the way through');
	await expect(page.getByText("Goes to Lena Brunner’s journal")).toBeVisible();

	await composerSave(page).click();

	const moment = page.locator('article').first();
	await expect(moment).toContainText('You');
	await expect(moment).toContainText('wrote in');
	await expect(moment.getByRole('link', { name: 'Lena Brunner' }).first()).toBeVisible();
	await expect(moment).toContainText('played the piano piece all the way through');
});

test('creates the people it mentions and offers to link the first two', async ({ page }) => {
	await page.getByLabel('What happened?').pressSequentially('Met ');
	await mention(page, 'Zelda', /Create.*Zelda/);
	await page.getByLabel('What happened?').pressSequentially('and ');
	await mention(page, 'Yorick', /Create.*Yorick/);
	await page.getByLabel('What happened?').pressSequentially('at the market');

	await composerSave(page).click();

	// The moment is anchored on the first person and lists the second as a mention chip.
	const moment = page.locator('article').first();
	await expect(moment.getByRole('link', { name: 'Zelda' }).first()).toBeVisible();
	await expect(moment).toContainText('at the market');
	await expect(moment.getByRole('link', { name: 'Yorick' }).first()).toBeVisible();

	// Both people were created inline and appear in the stream in their own right.
	await expect(page.locator('article', { hasText: 'New person' })).toHaveCount(2);

	// The relationship is offered, never guessed: the hint links to the other person's page.
	const hint = page.getByRole('status');
	await expect(hint).toContainText('Link Zelda and Yorick?');
	await hint.getByRole('link', { name: 'Link' }).click();
	await expect(page).toHaveURL(/\/contacts\/[^/?]+\?relate=[^#]+#relationships/);
});

test('keeps a private moment marked as private', async ({ page }) => {
	await page.getByText('Shared', { exact: true }).click();
	await expect(page.getByText('Private', { exact: true })).toBeVisible();

	await page.getByLabel('What happened?').pressSequentially('Coffee with ');
	await mention(page, 'Quill', /Create.*Quill/);
	await page.getByLabel('What happened?').pressSequentially('about the surprise party');

	await composerSave(page).click();

	const moment = page.locator('article').first();
	await expect(moment).toContainText('about the surprise party');
	await expect(moment).toContainText('private');
});

test('refuses to save a moment that mentions nobody', async ({ page }) => {
	await page.getByLabel('What happened?').pressSequentially('Nice day today');

	await expect(page.getByText('Mention at least one person with @')).toBeVisible();
	await expect(composerSave(page)).toBeDisabled();
});

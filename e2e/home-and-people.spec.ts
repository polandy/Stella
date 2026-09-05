import { expect, test, type Page } from '@playwright/test';
import { appReady } from './app';

/*
 * Home's rail, the People directory and the ⌘K palette (docs/02 §2.12.1, §2.2, §2.22.1;
 * docs/05 §5.4). Written after the screens were merged and seen in the running app
 * (docs/08 §8.4.1). Runs against the demo dataset, signed in as the demo admin; the person
 * created here (Xenia Quillford) is absent from the seed.
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

test('names a person nobody has written about in months, and offers to write a moment', async ({ page }) => {
	const quiet = page.getByTestId('quiet-lately');

	// Reto's last entry is seeded three hundred days back; Markus was written about yesterday.
	await expect(quiet.getByRole('link', { name: 'Reto Hofer' })).toBeVisible();
	await expect(quiet.getByRole('link', { name: 'Markus Brunner' })).toHaveCount(0);

	await quiet.getByRole('listitem').filter({ hasText: 'Reto Hofer' }).getByRole('link', { name: 'Write a moment' }).click();

	await expect(page.getByLabel('What happened?')).toHaveValue(/Reto/);
});

test('finds a person by the nickname given when they were added', async ({ page }) => {
	await page.goto('/contacts/new');
	await page.getByLabel('First name').fill('Xenia');
	await page.getByLabel('Last name').fill('Quillford');
	await page.getByText('More — nickname, birthday').click();
	await page.getByLabel('Nickname').fill('Xeni');
	await page.getByRole('button', { name: 'Add person' }).click();
	await expect(page.getByRole('heading', { name: 'Xenia Quillford' })).toBeVisible();

	await page.goto('/contacts');
	const directory = page.getByTestId('people-directory');
	await expect(directory.getByRole('link', { name: /Hans Brunner/ })).toBeVisible();

	await page.getByPlaceholder('Find someone…').fill('xeni');

	await expect(directory.getByRole('link', { name: /Xenia Quillford/ })).toBeVisible();
	await expect(directory.getByRole('link', { name: /Hans Brunner/ })).toHaveCount(0);

	await page.getByPlaceholder('Find someone…').fill('nobody-by-this-name');
	await expect(page.getByRole('status')).toHaveText(/Nobody matches/);
});

test('jumps to a person from anywhere with ⌘K, type, Enter', async ({ page }) => {
	await page.goto('/circles');
	// The shortcut only listens once the shell has mounted, and the trigger enables itself at
	// the same moment — so this is the page saying it is ready, not a wait and a hope.
	await appReady(page);
	await page.keyboard.press('Control+k');
	const palette = page.getByRole('dialog', { name: 'Jump to' });
	await expect(palette).toBeVisible();

	await page.keyboard.type('Vreni');
	await expect(palette.getByRole('option', { name: /Vreni Zbinden/ })).toHaveAttribute('aria-selected', 'true');
	await page.keyboard.press('Enter');

	await expect(page).toHaveURL(/\/contacts\/demo-c-vreni$/);
	await expect(page.getByRole('heading', { name: 'Vreni Zbinden' })).toBeVisible();
});

test.describe('on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test('the pencil in the tab bar opens the composer as a sheet', async ({ page }) => {
		await expect(page.getByTestId('compose-sheet')).toHaveCount(0);

		// The tab bar's pencil, not the rail's per-person links of the same name.
		await page.locator('nav').getByRole('link', { name: 'Write a moment' }).click();

		await expect(page.getByTestId('compose-sheet')).toBeVisible();
		await expect(page.getByLabel('What happened?')).toBeFocused();
	});
});

import { expect, test } from '@playwright/test';
import { appReady, signIn } from './app';

/*
 * Tidying up the people known by a first name only (docs/02 §2.2.3), from Settings → Data
 * quality. Written after the screen was seen in the running app (docs/08 §8.4.1).
 *
 * A first name alone can no longer be added by hand, so the case makes one the way older
 * data got there: added with a description, which is then emptied on their page. Theobald
 * is a name neither the demo household nor any other case uses.
 */

const NAME = 'Theobald';
const FIRST_DESCRIPTION = 'Met at the Blüemlisalp hut';
const KNOWN_BY = 'Hut warden, Blüemlisalp, Aug 2026';

test('lists someone known by a first name only, and a description takes them off the list', async ({ page }) => {
	await signIn(page);

	await page.goto('/contacts/new');
	await page.getByLabel('First name').fill(NAME);
	await page.getByLabel('Description').fill(FIRST_DESCRIPTION);
	await page.getByRole('button', { name: 'Add person' }).click();
	await expect(page.getByRole('heading', { name: NAME })).toBeVisible();
	await appReady(page);

	// Emptied where it is read, leaving nothing but the first name.
	await page.getByRole('button', { name: FIRST_DESCRIPTION }).click();
	await page.getByRole('textbox', { name: 'Edit description' }).fill('');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByRole('button', { name: 'Add a description' })).toBeVisible();

	await page.goto('/settings');
	const card = page.getByRole('link', { name: /People known by a first name only/ });
	await expect(card.getByTestId('first-name-only-count')).toBeVisible();
	await card.click();

	const row = page.getByTestId('first-name-only-row').filter({ has: page.getByRole('link', { name: NAME, exact: true }) });
	await expect(row).toHaveCount(1);
	await row.getByRole('textbox', { name: `What will you know ${NAME} by?` }).fill(KNOWN_BY);
	await row.getByRole('button', { name: 'Save' }).click();
	await expect(row).toHaveCount(0);

	// It is the person who changed, not just the list: their page says it, under the same name.
	await page.goto('/contacts');
	await page.getByRole('link', { name: new RegExp(NAME) }).first().click();
	await expect(page.getByRole('heading', { name: NAME })).toBeVisible();
	await expect(page.getByRole('button', { name: KNOWN_BY })).toBeVisible();
});

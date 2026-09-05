import { expect, test } from '@playwright/test';
import { openPerson, signIn } from './app';

/*
 * Who wrote each story item (docs/02 §2.23, docs/05 §5.5). Written after the screens were
 * seen in the running app (docs/08 §8.4.1).
 *
 * The demo household has two members: the admin this suite signs in as, and Nina Brunner,
 * who wrote part of Hans Brunner's story. Read-only — it asserts what the seed already says.
 */

const NINA_ENTRY = 'sharpened every knife';
const MY_ENTRY = '1972 flood';

test.beforeEach(async ({ page }) => {
	await signIn(page);
	await openPerson(page, /Hans Brunner/);
});

test('names the member who wrote each item, and calls the viewer you', async ({ page }) => {
	const mine = page.locator('[data-story-item]', { hasText: MY_ENTRY });
	const hers = page.locator('[data-story-item]', { hasText: NINA_ENTRY });

	// Both halves in one case: "Nina" only means something next to an item that says "you".
	await expect(hers).toContainText('Nina');
	await expect(hers).not.toContainText('you');
	await expect(mine).toContainText('you');
	await expect(mine).not.toContainText('Nina');
});

test('offers to remove only the items the viewer wrote', async ({ page }) => {
	const mine = page.locator('[data-story-item]', { hasText: MY_ENTRY });
	const hers = page.locator('[data-story-item]', { hasText: NINA_ENTRY });

	await expect(mine.getByRole('button', { name: 'Remove entry' })).toHaveCount(1);
	await expect(hers.getByRole('button', { name: 'Remove entry' })).toHaveCount(0);
});

test('says the same on the journal page, where there is no kind beside it', async ({ page }) => {
	await page.getByRole('link', { name: 'Write' }).first().click();
	await expect(page.getByRole('heading', { name: 'Journal' })).toBeVisible();

	const hers = page.locator('article', { hasText: NINA_ENTRY });
	const mine = page.locator('article', { hasText: MY_ENTRY });
	await expect(hers).toContainText('by Nina');
	await expect(mine).toContainText('by you');
});

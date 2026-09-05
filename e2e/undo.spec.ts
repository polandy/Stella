import { expect, test, type Page } from '@playwright/test';

/*
 * Removing with undo (docs/02 §2.23, docs/05 §5.7). Written after the flow was verified in the
 * running app (docs/08 §8.4.1). The touchpoint removed here is logged by the test itself, on
 * a title no seeded data uses, so no other case's counts move.
 */

/** Signs in through the SEED_DEMO one-click button and lands on Home. */
async function signIn(page: Page): Promise<void> {
	await page.goto('/login');
	await page.getByRole('button', { name: 'Sign in as demo user' }).click();
	await expect(page.getByRole('heading', { name: 'What happened?' })).toBeVisible();
}

/** Opens a seeded person's page from the contacts list, through the app's own links. */
async function openPerson(page: Page, name: RegExp): Promise<void> {
	await page.getByRole('link', { name: 'People' }).first().click();
	await page.getByRole('link', { name }).first().click();
	await expect(page.getByRole('tab', { name: 'Story' })).toHaveAttribute('aria-selected', 'true');
}

const TITLE = 'Quill call that was logged twice';

test('a removed touchpoint comes back with Undo and is only sent when the page is left', async ({ page }) => {
	await signIn(page);
	await openPerson(page, /Rosa Brunner/);

	const panel = page.locator('#panel-story');
	await panel.getByRole('button', { name: 'Log contact' }).click();
	await panel.getByLabel('Kind').selectOption('call');
	await panel.getByLabel('Day').fill('2026-09-02');
	await panel.getByPlaceholder('What happened? (optional)').fill(TITLE);
	await panel.getByRole('button', { name: 'Log interaction' }).click();

	const timeline = page.getByTestId('story-timeline');
	const item = page.locator('[data-story-item]', { hasText: TITLE });
	await expect(item).toHaveCount(1);

	// Remove: gone at once, the toast offers Undo, nothing has reached the server yet.
	await item.getByRole('button', { name: 'Remove interaction' }).click();
	await expect(timeline).not.toContainText(TITLE);
	const toast = page.getByTestId('toast-undo');
	await expect(toast).toContainText('Interaction removed');

	await toast.getByRole('button', { name: 'Undo' }).click();
	await expect(toast).toHaveCount(0);
	await expect(timeline).toContainText(TITLE);
	await page.reload();
	await expect(page.getByTestId('story-timeline')).toContainText(TITLE);

	// Remove again and leave through a link: the removal is sent before the next screen loads.
	await page.locator('[data-story-item]', { hasText: TITLE }).getByRole('button', { name: 'Remove interaction' }).click();
	await expect(page.getByTestId('toast-undo')).toBeVisible();
	await openPerson(page, /Rosa Brunner/);
	await expect(page.getByTestId('story-timeline')).not.toContainText(TITLE);
	await expect(page.getByTestId('toast-undo')).toHaveCount(0);
});

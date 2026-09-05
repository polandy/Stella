import { expect, type Page } from '@playwright/test';

/*
 * Shared steps for driving the signed-in app.
 *
 * `appReady` exists because several controls do nothing until this shell has mounted — the
 * ⌘K palette, a section's *Add*, *New circle*. The palette trigger is disabled until then
 * (`(app)/+layout.svelte`), so waiting for it to be enabled is the page saying it is ready
 * rather than a test waiting and hoping.
 */

/** Signs in through the SEED_DEMO one-click button and lands on Home. */
export async function signIn(page: Page): Promise<void> {
	await page.goto('/login');
	await page.getByRole('button', { name: 'Sign in as demo user' }).click();
	await expect(page.getByRole('heading', { name: 'What happened?' })).toBeVisible();
}

/** Waits until the app shell is interactive, so a JavaScript-only control will answer. */
export async function appReady(page: Page): Promise<void> {
	await expect(page.getByRole('button', { name: 'Search' })).toBeEnabled();
}

/** Opens a person's page from the directory, through the app's own links. */
export async function openPerson(page: Page, name: RegExp): Promise<void> {
	await page.getByRole('link', { name: 'People' }).first().click();
	await expect(page.getByRole('heading', { name: 'People' })).toBeVisible();
	await page.getByRole('link', { name }).first().click();
	await expect(page.getByRole('tab', { name: 'Story' })).toHaveAttribute('aria-selected', 'true');
	await appReady(page);
}

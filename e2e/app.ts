import { expect, type Page } from '@playwright/test';

/*
 * Shared steps for driving the signed-in app.
 *
 * `appReady` exists because several controls do nothing until this shell has mounted — the
 * ⌘K palette, a section's *Add*, *New circle*. The palette trigger is disabled until then
 * (`(app)/+layout.svelte`), so waiting for it to be enabled is the page saying it is ready
 * rather than a test waiting and hoping.
 */

/** Where an unauthenticated request lands, so `signIn` can tell it needs to sign in. */
const LOGIN_PATH = '/login';

/**
 * Opens Home signed in. The `setup` project normally hands every spec a stored session, so
 * this is one navigation; when that project was filtered out (`--grep`), the app redirects
 * to the login screen and the SEED_DEMO one-click button gets a session here instead.
 */
export async function signIn(page: Page): Promise<void> {
	await page.goto('/');
	if (new URL(page.url()).pathname === LOGIN_PATH) {
		await page.getByRole('button', { name: 'Sign in as demo user' }).click();
	}
	await expect(page.getByRole('heading', { name: 'What happened?' })).toBeVisible();
	// Home is served fast enough now that a spec can start typing into the moment composer
	// before its @-picker is wired up, so hand back a shell that has actually mounted.
	await appReady(page);
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

/** Types `@query` into the moment composer and picks the suggestion whose label matches. */
export async function mention(page: Page, query: string, label: RegExp): Promise<void> {
	await page.getByLabel('What happened?').pressSequentially(`@${query}`);
	await page.getByRole('option', { name: label }).click();
}

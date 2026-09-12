import { expect, type Locator, type Page } from '@playwright/test';

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
	await expect(page.getByRole('tab', { name: 'People' })).toHaveAttribute('aria-selected', 'true');
	await appReady(page);
}

/** Types `@query` into the moment composer and picks the suggestion whose label matches. */
export async function mention(page: Page, query: string, label: RegExp): Promise<void> {
	await page.getByLabel('What happened?').pressSequentially(`@${query}`);
	await page.getByRole('option', { name: label }).click();
}

/**
 * Types a name into a `PersonSearchSelect` combobox (relationship target, circle member,
 * interaction participant, merge duplicate) and picks the matching option. Replaces a plain
 * `<select>` interaction: the field filters as you type, so it needs a query first.
 */
export async function pickPerson(field: Locator, name: string): Promise<void> {
	await field.click();
	await field.fill(name);
	await field.page().getByRole('option', { name }).click();
	// Multi-select keeps the list open for adding another person; close it so it cannot
	// overlap and intercept the next click (the single-select case is already closed). The
	// input keeps focus through the option's mousedown handler, so send the key to whatever
	// is focused rather than re-resolving `field` — its own actionability check can stall
	// while the just-added chip is still shifting the input's layout.
	await field.page().keyboard.press('Escape');
}

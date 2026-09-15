import { expect, type Locator, type Page } from '@playwright/test';
import { isoToParts } from '../src/lib/dates/field';

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

/**
 * Opens the people directory through the app's own nav link.
 *
 * Client-side on purpose, where a spec has just removed something: the layout cancels such a
 * navigation, flushes the deferred removal and only then re-issues it, so the next screen
 * cannot read the item back ((app)/+layout.svelte). A `page.goto` is a `leave` instead, which
 * fires the removal with `keepalive` and does not wait for it — a race, not a seam.
 */
export async function openPeople(page: Page): Promise<void> {
	await page.getByRole('link', { name: 'People' }).first().click();
	await expect(page.getByRole('heading', { name: 'People' })).toBeVisible();
}

/** Opens a person's page from the directory, through the app's own links. */
export async function openPerson(page: Page, name: RegExp): Promise<void> {
	await openPeople(page);
	await page.getByRole('link', { name }).first().click();
	await expect(page.locator('#section-relationships')).toBeVisible();
	await appReady(page);
}

/** Adds a person through the real form and lands on their page. */
export async function addPerson(page: Page, first: string, last: string): Promise<void> {
	await page.goto('/contacts/new');
	await page.getByLabel('First name').fill(first);
	await page.getByLabel('Last name').fill(last);
	await page.getByRole('button', { name: 'Add person' }).click();
	await expect(page.getByRole('heading', { name: `${first} ${last}` })).toBeVisible();
	await appReady(page);
}

/**
 * A row of the person page's profile card, unfolded (docs/05 §5.5). A row holding nothing
 * arrives folded, so the content under test is only on the page once it has been opened.
 */
export async function profileRow(page: Page, title: string): Promise<Locator> {
	const row = page.locator(`section[data-row="${title}"]`);
	const toggle = row.getByRole('button', { name: new RegExp(`^${title}`) });
	if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
	await expect(toggle).toHaveAttribute('aria-expanded', 'true');
	return row;
}

/** Adds a tag through the section's own form and waits for it to be on the page. */
export async function addTag(page: Page, name: string): Promise<void> {
	const tags = await profileRow(page, 'Tags');
	await tags.getByRole('button', { name: 'Add' }).click();
	await tags.getByPlaceholder('Tag name').fill(name);
	await tags.getByRole('button', { name: 'Add', exact: true }).last().click();
	await expect(tags).toContainText(name);
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

/**
 * Fills a `DateField` with an ISO day. The field is three controls in the reader's own
 * language rather than one native `<input type="date">`, so a spec names the day it wants
 * and this puts it in the right segments — `--MM-DD` leaving the year blank.
 */
export async function fillDate(scope: Locator, groupName: string, iso: string): Promise<void> {
	const parts = isoToParts(iso);
	const group = scope.getByRole('group', { name: groupName });
	await group.getByLabel('Month', { exact: true }).selectOption(parts.month);
	await group.getByLabel('Day', { exact: true }).fill(parts.day);
	await group.getByLabel('Year', { exact: true }).fill(parts.year);
}

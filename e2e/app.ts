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

/**
 * Waits until the app shell is interactive, so a JavaScript-only control will answer. The top
 * bar's search button is enabled once the shell has mounted; on a phone's Home it is hidden
 * (the page's own field is the search there), so it is read whether shown or not.
 */
export async function appReady(page: Page): Promise<void> {
	await expect(
		page.getByTestId('top-bar').getByRole('button', { name: 'Search', includeHidden: true })
	).toBeEnabled();
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

/**
 * Turns on the People card's edit mode (docs/05 §5.5), which puts *Edit*, remove and *Confirm*
 * on every row. The toggle is a script control, so a press that lands before the page has
 * hydrated is pressed again — but only while the card still says it is not editing.
 */
export async function editPeople(page: Page): Promise<void> {
	const toggle = page.getByTestId('relationships-edit');
	await expect(async () => {
		if ((await toggle.textContent())?.trim() === 'Edit') await toggle.click();
		await expect(toggle).toHaveText('Done', { timeout: 1000 });
	}).toPass();
}

/** Unfolds the People card, whose list and worked-out relatives fold to a handful (docs/05 §5.5). */
export async function unfoldPeople(page: Page): Promise<void> {
	const card = page.locator('#section-relationships');
	await card.getByRole('button', { name: /^Show \d+ more$/ }).click();
	await expect(card.getByRole('button', { name: 'Show fewer' })).toBeVisible();
}

/**
 * Enlarges the People card's map: the card shows a preview on every width and the live map is
 * one *Enlarge map* away (docs/05 §5.5). Done once the live map shows and holds the cursor.
 */
export async function enlargeMap(page: Page): Promise<void> {
	const enlarge = page
		.getByTestId('person-map-preview')
		.getByRole('button', { name: 'Enlarge map' });
	// Disabled until the explorer's code has arrived: there is nothing to enlarge before.
	await expect(enlarge).toBeEnabled();
	await enlarge.click();
	await expect(
		page.getByTestId('person-map-enlarged').getByRole('button', { name: 'Shrink map' })
	).toBeFocused();
}

/** Chooses one of the People card's rarer actions from its ⋯ menu (docs/05 §5.5). */
export async function fromPeopleMenu(page: Page, item: string): Promise<void> {
	const trigger = page
		.locator('#section-relationships')
		.getByRole('button', { name: 'More for these relationships' });
	const choice = page.getByRole('menuitem', { name: item });
	// The ⋯ is a script control: a press before the page has hydrated opens nothing, so it is
	// pressed again — but only while the menu is still closed.
	await expect(async () => {
		if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
		await expect(choice).toBeVisible({ timeout: 1000 });
	}).toPass();
	await choice.click();
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
 * A row of the person page's identity card, on the card: an empty one waits behind the card's
 * one quiet button (docs/05 §5.5), which is pressed when the row is not there yet.
 */
export async function identityRow(page: Page, row: Locator): Promise<Locator> {
	const addMore = page.getByTestId('identity-add-more');
	await expect(row.or(addMore).first()).toBeVisible();
	if ((await row.count()) === 0) await addMore.click();
	await expect(row).toBeVisible();
	return row;
}

/**
 * A row of the person page's identity card, unfolded (docs/05 §5.5). A row holding nothing
 * waits behind the card's quiet button and arrives folded, so the content under test is only
 * on the page once both have been opened.
 */
export async function profileRow(page: Page, title: string): Promise<Locator> {
	const row = await identityRow(page, page.locator(`section[data-row="${title}"]`));
	const toggle = row.getByRole('button', { name: new RegExp(`^${title}`) });
	if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
	await expect(toggle).toHaveAttribute('aria-expanded', 'true');
	return row;
}

/**
 * Opens the editor of one of the identity card's facts — the dates, the address or the circles
 * — where it is read (docs/05 §5.5). A fact the record does not hold yet waits behind the
 * card's quiet button as a slot, which is pressed when it is not there yet.
 */
export async function factEditor(
	page: Page,
	fact: 'dates' | 'address' | 'circles'
): Promise<Locator> {
	const opener = page.getByTestId('identity-facts').locator(`[data-edit="${fact}"]`).first();
	await identityRow(page, opener);
	await opener.click();
	const editor = page.locator(`[data-fact-editor="${fact}"]`);
	await expect(editor).toBeVisible();
	return editor;
}

/**
 * Picks an entry of the ⋯ menu on the person page's identity card (docs/05 §5.5) — where
 * logging a touchpoint and the record-keeping actions live. Archiving, merging and deleting
 * open a confirm step on the card; the caller presses its button.
 */
export async function recordAction(page: Page, name: string): Promise<void> {
	await page.getByRole('button', { name: 'More actions' }).click();
	await page.getByRole('menuitem', { name, exact: true }).click();
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
 * Mentions somebody new in the moment composer: "Create …" opens a small panel with the name
 * filled in (docs/02 §2.22.1), and adding from it writes the mention. A first name alone needs a
 * line to know them by (§2.2.3), so one is given.
 */
export async function mentionNew(
	page: Page,
	name: string,
	description = 'Met at the market'
): Promise<void> {
	await page.getByLabel('What happened?').pressSequentially(`@${name}`);
	await page.getByRole('option', { name: new RegExp(`Create.*${name}`) }).click();
	const panel = page.getByTestId('composer-create');
	await panel.getByLabel('Description').fill(description);
	await panel.getByRole('button', { name: 'Add to the moment' }).click();
}

/**
 * Types a name into a `PersonSearchSelect` combobox (relationship target, circle member,
 * interaction participant, merge duplicate) and picks the matching option. Replaces a plain
 * `<select>` interaction: the field filters as you type, so it needs a query first.
 */
export async function pickPerson(field: Locator, name: string): Promise<void> {
	await field.click();
	await field.fill(name);
	// Among the people only: the offer to add someone new is an option too, and its name
	// carries the query, so it would match a full name typed here.
	await field.page().getByTestId('person-search-listbox').getByRole('option', { name }).click();
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

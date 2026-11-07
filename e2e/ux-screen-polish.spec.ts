import { expect, test, type Page } from '@playwright/test';
import { addPerson, appReady, signIn } from './app';

/*
 * The second half of review 2026-11's UX polish (UX-16, UX-19, UX-22, UX-25): the Tags page's
 * way to a first tag, an empty Share page, *Add person* off its own page, People's quiet dates
 * and a last name found while its Undo is still open. Written after the owner's hand test
 * (docs/08 §8.4.1).
 *
 * The suite runs on the demo household, which has tags, so the empty Tags page itself is not
 * reachable here; what its button opens is. Every name carries this attempt's letters, so a
 * retry against the same database never finds an earlier attempt's person.
 */

/** Six letters no other attempt shares. */
function runLetters(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) =>
		String.fromCharCode(97 + (byte % 26))
	).join('');
}

/** A name as one would type it, capitalised, with this attempt's letters. */
const named = (stem: string) => `${stem}${runLetters()}`;

async function addFirstNameOnly(page: Page, first: string): Promise<void> {
	await page.goto('/contacts/new');
	await page.getByLabel('First name').fill(first);
	// A first name alone needs a word on who they are (docs/02 §2.2.1).
	await page.getByLabel('Description').fill('Met at the Klausen pass');
	await page.getByRole('button', { name: 'Add person' }).click();
	await expect(page.getByRole('heading', { name: first })).toBeVisible();
	await appReady(page);
}

/** The People row of `name`, by its link. */
const peopleRow = (page: Page, name: string) =>
	page.getByTestId('people-directory').getByRole('link', { name: new RegExp(`^${name}`) });

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('the empty Tags page’s Write a moment opens the composer with a # typed', async ({ page }) => {
	await page.goto('/?compose=tag');
	await appReady(page);
	await expect(page.getByLabel('What happened?').first()).toHaveValue('#');
});

test('an empty Share page says where sharing starts and links to the install', async ({ page }) => {
	await page.goto('/share');
	await appReady(page);
	const whereFrom = page.getByTestId('share-where-from');
	await expect(whereFrom).toContainText('shows up in other apps’ Share menu');
	await expect(whereFrom.getByRole('link', { name: 'Install Stella' })).toHaveAttribute(
		'href',
		'/settings#install'
	);
});

test('the top bar offers Add person everywhere but on its own page', async ({ page }) => {
	const offer = page.getByRole('banner').getByRole('link', { name: 'Add person' });
	await page.goto('/contacts');
	await appReady(page);
	await expect(offer).toBeVisible();

	await page.goto('/contacts/new');
	await appReady(page);
	await expect(page.getByLabel('First name')).toBeVisible();
	await expect(offer).toHaveCount(0);
});

test('a People row shows when someone was last written about, and nothing when never', async ({
	page
}) => {
	const fresh = named('Ulrika');
	await addPerson(page, fresh, 'Neverwritten');
	await page.goto('/contacts');
	await appReady(page);

	await expect(
		peopleRow(page, 'Markus Brunner').locator('[title^="Last written about"]')
	).toBeVisible();
	await expect(peopleRow(page, `${fresh} Neverwritten`)).toBeVisible();
	await expect(
		peopleRow(page, `${fresh} Neverwritten`).locator('[title^="Last written about"]')
	).toHaveCount(0);
});

test('a last name set on People is found by its search and ⌘K while Undo is open, and Undo takes it back', async ({
	page
}) => {
	const first = named('Hildebert');
	const last = named('Gwerder');
	await addFirstNameOnly(page, first);

	await page.goto('/contacts');
	await appReady(page);
	await page.getByRole('button', { name: 'More for people' }).click();
	await page.getByRole('menuitem', { name: 'Set last name for several…' }).click();
	await page.getByLabel(`Choose ${first}`, { exact: true }).check();
	await page.getByRole('button', { name: 'Set last name' }).click();
	const panel = page.getByTestId('set-last-name');
	await panel.getByLabel('Set last name').fill(last);
	await panel.getByRole('button', { name: 'Set', exact: true }).click();

	// Still held for Undo, nothing sent yet — yet the list and ⌘K already read the new name.
	const toast = page.getByTestId('toast-undo');
	await expect(toast).toContainText(`Last name ${last} set`);
	await page.getByRole('searchbox', { name: 'Find someone' }).fill(last);
	await expect(peopleRow(page, `${first} ${last}`)).toBeVisible();

	await page.keyboard.press('Control+k');
	await page.keyboard.type(last);
	const palette = page.getByRole('dialog', { name: 'Jump to' });
	await expect(palette.getByRole('option', { name: new RegExp(`^${first} ${last}`) })).toHaveCount(
		1
	);
	await page.keyboard.press('Escape');
	await expect(palette).toHaveCount(0);

	await toast.getByRole('button', { name: 'Undo' }).click();
	await expect(toast).toHaveCount(0);
	await expect(peopleRow(page, `${first} ${last}`)).toHaveCount(0);
	await page.getByRole('searchbox', { name: 'Find someone' }).fill(first);
	await expect(peopleRow(page, first)).toBeVisible();
	await expect(peopleRow(page, `${first} ${last}`)).toHaveCount(0);
});

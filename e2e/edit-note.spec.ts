import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { addPerson, appReady, signIn } from './app';
import { DEMO_ADMIN_PASSWORD, DEMO_MEMBER_EMAIL } from '../src/lib/server/db/demo-seed';

/*
 * Editing a note (docs/02 §2.5, docs/03 §3.7): its author alone, title and body, in place; an
 * admin keeps Remove on a shared note but never Edit; the @-mentions and the search row follow
 * the new text. Written after the flow was verified in the running app (docs/08 §8.4.1). The
 * people are the spec's own and the searched words are letters no other run shares.
 */

function runLetters(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) =>
		String.fromCharCode(97 + (byte % 26))
	).join('');
}

/** A second browser signed in as the household's other member, Nina — no admin. */
async function signInAsNina(browser: Browser): Promise<Page> {
	const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
	const page = await context.newPage();
	await page.goto('/login');
	await page.getByLabel('Email').fill(DEMO_MEMBER_EMAIL);
	await page.getByLabel('Password').fill(DEMO_ADMIN_PASSWORD);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'What happened?' })).toBeVisible();
	await appReady(page);
	return page;
}

const notesCard = (page: Page) => page.locator('#section-notes');
const note = (page: Page, text: string): Locator =>
	notesCard(page).locator('li', { hasText: text });
const editOn = (page: Page, text: string) =>
	note(page, text).getByRole('button', { name: 'Edit note' });
const removeOn = (page: Page, text: string) =>
	note(page, text).getByRole('button', { name: 'Remove note' });
const searchHits = (page: Page) => page.getByRole('link', { name: /on Edwina/ });

/** Writes a shared note naming `handle`'s person, picked from the @-list. */
async function writeNote(page: Page, text: string, handle: string, person: string) {
	await notesCard(page).getByRole('button', { name: 'Add note' }).click();
	const field = page.getByRole('textbox', { name: 'Note' });
	await field.fill(`${text} mit `);
	await field.pressSequentially(handle);
	await page.getByTestId('mention-picker').getByRole('option', { name: person }).click();
	await notesCard(page).getByRole('button', { name: 'Add note' }).click();
	await expect(note(page, text)).toHaveCount(1);
}

async function searchFor(page: Page, query: string) {
	await page.goto(`/search?q=${encodeURIComponent(query)}`);
	await expect(page.getByRole('heading', { name: 'Search', exact: true })).toBeVisible();
}

test('an author edits their note; nobody else may, and an admin only removes', async ({
	page,
	browser
}) => {
	const letters = runLetters();
	const old = `alt${letters}`;
	const fresh = `neu${letters}`;
	const adminsOwn = `admin${letters}`;
	const title = `Titel ${letters}`;
	const FIRST = 'Edwina';
	const LAST = `Prell${letters}`;
	const OLD_PERSON = `Berta Aeschbacher${letters}`;
	const NEW_PERSON = `Cyrill Ammann${letters}`;

	await signIn(page);
	await addPerson(page, 'Berta', `Aeschbacher${letters}`);
	await addPerson(page, 'Cyrill', `Ammann${letters}`);
	await addPerson(page, FIRST, LAST);
	const personUrl = page.url();
	await writeNote(page, adminsOwn, '@Berta', OLD_PERSON);

	const nina = await signInAsNina(browser);
	await nina.goto(personUrl);
	await appReady(nina);
	await writeNote(nina, old, '@Berta', OLD_PERSON);

	// Who may: Nina on hers (and may remove it); nobody on the other's — no pencil, no cross.
	await expect(editOn(nina, old)).toHaveCount(1);
	await expect(removeOn(nina, old)).toHaveCount(1);
	await expect(note(nina, adminsOwn)).toHaveCount(1);
	await expect(editOn(nina, adminsOwn)).toHaveCount(0);
	await expect(removeOn(nina, adminsOwn)).toHaveCount(0);

	// The admin: Remove on Nina's shared note, Edit on none but their own.
	await page.reload();
	await appReady(page);
	await expect(removeOn(page, old)).toHaveCount(1);
	await expect(editOn(page, old)).toHaveCount(0);
	await expect(editOn(page, adminsOwn)).toHaveCount(1);

	// The old words are found, and the note is on Berta's page.
	await searchFor(page, old);
	await expect(searchHits(page)).toHaveCount(1);
	await nina.goto(personUrl);
	await appReady(nina);

	// Nina edits title and body, and names Cyrill instead of Berta.
	await editOn(nina, old).click();
	const field = nina.getByRole('textbox', { name: 'Note' });
	await nina.getByLabel('Title (optional)').fill(title);
	await field.fill(`${fresh} mit `);
	await field.pressSequentially('@Cyrill');
	await nina.getByTestId('mention-picker').getByRole('option', { name: NEW_PERSON }).click();
	await nina.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(nina.getByTestId('toast-notice')).toContainText('Saved');
	await expect(field).toHaveCount(0);
	await expect(note(nina, fresh)).toContainText(title);
	await expect(note(nina, old)).toHaveCount(0);
	// Still shared, still hers.
	await expect(removeOn(nina, fresh)).toHaveCount(1);

	// The mention moved: Cyrill's page lists the note, Berta's no longer does.
	await searchFor(nina, fresh);
	await expect(searchHits(nina)).toHaveCount(1);
	await searchFor(nina, old);
	await expect(nina.getByText(`No results for “${old}”.`)).toBeVisible();

	await page.goto(await contactUrl(page, NEW_PERSON));
	await expect(page.getByTestId('mentioned-in')).toContainText(fresh);
	await page.goto(await contactUrl(page, OLD_PERSON));
	await expect(page.getByTestId('mentioned-in')).not.toContainText(fresh);
	// Positive control: Berta is still named by the admin's own note.
	await expect(page.getByTestId('mentioned-in')).toContainText(adminsOwn);
	await nina.context().close();
});

/** The address of a person, found through the people search. */
async function contactUrl(page: Page, name: string): Promise<string> {
	await page.goto(`/search?q=${encodeURIComponent(name)}`);
	const link = page.getByRole('link', { name: new RegExp(name) }).first();
	const href = await link.getAttribute('href');
	if (!href) throw new Error(`no link to ${name}`);
	return href;
}

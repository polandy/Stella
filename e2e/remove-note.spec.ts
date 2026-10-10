import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { addPerson, appReady, signIn } from './app';
import { DEMO_ADMIN_PASSWORD, DEMO_MEMBER_EMAIL } from '../src/lib/server/db/demo-seed';

/*
 * Removing a note (docs/02 §2.5, §2.11, §2.23, docs/03 §3.7): its author always, an admin on a
 * shared one, never on a private one; held for the undo window; an admin's removal of someone
 * else's note is told in What's new, an author's own is not. Written after the flow was
 * verified in the running app (docs/08 §8.4.1). The person is the spec's own, so no other
 * case's notes or notices move.
 */

const FIRST = 'Quirin';
const LAST = 'Notizbaum';
const PERSON = `${FIRST} ${LAST}`;
const ADMINS = 'Admin wrote this: likes quinces';
const NINAS = 'Nina wrote this: allergic to quinces';
const NINAS_PRIVATE = 'Nina alone knows: hates quinces';

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
const removeOn = (page: Page, text: string) =>
	note(page, text).getByRole('button', { name: 'Remove note' });

async function writeNote(page: Page, body: string, visibility: 'Shared' | 'Private' = 'Shared') {
	await notesCard(page).getByRole('button', { name: 'Add note' }).click();
	await page.getByRole('textbox', { name: 'Note' }).fill(body);
	await notesCard(page).getByText(visibility, { exact: true }).click();
	await notesCard(page).getByRole('button', { name: 'Add note' }).click();
	await expect(note(page, body)).toHaveCount(1);
}

/** Leaves through the app's own Home link: a held removal is sent before Home loads (§2.23). */
async function leaveForHome(page: Page) {
	await page.getByRole('link', { name: 'Home', exact: true }).first().click();
	await expect(page.getByRole('heading', { name: 'What happened?' })).toBeVisible();
}

/** The What's new lines about this spec's person. */
const notices = (page: Page) =>
	page.getByTestId('stream-notice').filter({ hasText: `note on ${PERSON}` });

test('an author removes their note, an admin a shared one of someone else’s, never a private one', async ({
	page,
	browser
}) => {
	await signIn(page);
	await addPerson(page, FIRST, LAST);
	const personUrl = page.url();
	await writeNote(page, ADMINS);

	// Nina, a member: Remove on her own notes, shared and private, none on the admin's.
	const nina = await signInAsNina(browser);
	await nina.goto(personUrl);
	await appReady(nina);
	await writeNote(nina, NINAS);
	await writeNote(nina, NINAS_PRIVATE, 'Private');
	await expect(removeOn(nina, NINAS)).toHaveCount(1);
	await expect(removeOn(nina, NINAS_PRIVATE)).toHaveCount(1);
	await expect(note(nina, ADMINS)).toHaveCount(1);
	await expect(removeOn(nina, ADMINS)).toHaveCount(0);

	// The admin: Remove on Nina's shared note, named as hers; her private one is not there at all.
	await page.reload();
	await appReady(page);
	await expect(note(page, NINAS)).toContainText('Nina');
	await expect(removeOn(page, NINAS)).toHaveCount(1);
	await expect(removeOn(page, ADMINS)).toHaveCount(1);
	await expect(note(page, NINAS_PRIVATE)).toHaveCount(0);

	// Remove, then Undo: back at once, and nothing reached the server.
	await removeOn(page, NINAS).click();
	await expect(note(page, NINAS)).toHaveCount(0);
	const toast = page.getByTestId('toast-undo');
	await expect(toast).toContainText('Note removed');
	await toast.getByRole('button', { name: 'Undo' }).click();
	await expect(note(page, NINAS)).toHaveCount(1);
	await page.reload();
	await expect(note(page, NINAS)).toHaveCount(1);

	// Remove again and leave: sent on the way out; Home tells it, without the note's text.
	await removeOn(page, NINAS).click();
	await expect(toast).toBeVisible();
	await leaveForHome(page);
	await expect(notices(page)).toHaveCount(1);
	await expect(notices(page)).toContainText(`You removed Nina Brunner’s note on ${PERSON}`);
	await expect(notices(page)).not.toContainText('quinces');

	// Nina reads it as her note; her private note is untouched.
	await nina.goto('/');
	await expect(notices(nina)).toContainText(`removed your note on ${PERSON}`);
	await nina.goto(personUrl);
	await expect(note(nina, NINAS)).toHaveCount(0);
	await expect(note(nina, NINAS_PRIVATE)).toHaveCount(1);

	// An author removing their own note leaves no line.
	await removeOn(nina, NINAS_PRIVATE).click();
	await expect(nina.getByTestId('toast-undo')).toBeVisible();
	await leaveForHome(nina);
	await nina.goto(personUrl);
	await expect(note(nina, NINAS_PRIVATE)).toHaveCount(0);
	await nina.goto('/');
	await expect(notices(nina)).toHaveCount(1);
	await nina.context().close();
});

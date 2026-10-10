import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { addPerson, appReady, fillDate, pickPerson, signIn } from './app';
import { DEMO_ADMIN_PASSWORD, DEMO_MEMBER_EMAIL } from '../src/lib/server/db/demo-seed';

/*
 * Editing a touchpoint (docs/02 §2.6, docs/03 §3.7): its author alone corrects the day, the kind,
 * the text and who took part, in place in Activity; an admin keeps Remove on a shared one but
 * never Edit, and a hand-made edit from them is refused. Written after the owner verified the
 * flow in the running app (docs/08 §8.4.1). The people and titles carry letters no other run
 * shares.
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

const storyCard = (page: Page) => page.locator('#section-story');
const item = (page: Page, text: string): Locator =>
	storyCard(page).locator('[data-story-item]', { hasText: text });
const editOn = (page: Page, text: string) =>
	item(page, text).getByRole('button', { name: 'Edit interaction' });
const removeOn = (page: Page, text: string) =>
	item(page, text).getByRole('button', { name: 'Remove interaction' });

/** Logs a shared touchpoint met in person on `day`, with `participant` if given. */
async function logTouchpoint(page: Page, title: string, day: string, participant?: string) {
	const card = storyCard(page);
	await card.getByRole('button', { name: 'Log contact' }).click();
	await card.getByLabel('Kind').selectOption('met');
	await fillDate(card, 'Day', day);
	await card.getByPlaceholder('What happened? (optional)').fill(title);
	if (participant) await pickPerson(card.getByLabel('Who else was there?'), participant);
	await card.getByRole('button', { name: 'Log interaction' }).click();
	await expect(item(page, title)).toHaveCount(1);
}

test('an author edits their touchpoint; nobody else may, and an admin only removes', async ({
	page,
	browser
}) => {
	const letters = runLetters();
	const old = `Quillsee ${letters}`;
	const fresh = `Quillanruf ${letters}`;
	const adminsOwn = `Quilladmin ${letters}`;
	const BEFORE = `Berta Aeschbacher${letters}`;
	const AFTER = `Cyrill Ammann${letters}`;

	await signIn(page);
	await addPerson(page, 'Berta', `Aeschbacher${letters}`);
	await addPerson(page, 'Cyrill', `Ammann${letters}`);
	await addPerson(page, 'Edwina', `Prell${letters}`);
	const personUrl = page.url();
	await logTouchpoint(page, adminsOwn, '2026-09-12');

	const nina = await signInAsNina(browser);
	await nina.goto(personUrl);
	await appReady(nina);
	await logTouchpoint(nina, old, '2026-09-10', BEFORE);

	// Who may: Nina on hers, pencil and cross; nothing on the admin's.
	await expect(editOn(nina, old)).toHaveCount(1);
	await expect(removeOn(nina, old)).toHaveCount(1);
	await expect(editOn(nina, adminsOwn)).toHaveCount(0);
	await expect(removeOn(nina, adminsOwn)).toHaveCount(0);

	// The admin: Remove on Nina's shared touchpoint, Edit on none but their own.
	await page.reload();
	await appReady(page);
	await expect(removeOn(page, old)).toHaveCount(1);
	await expect(editOn(page, old)).toHaveCount(0);
	await expect(editOn(page, adminsOwn)).toHaveCount(1);

	// A hand-made edit from the admin is refused like a touchpoint that is gone, and changes nothing.
	const id = await item(page, old).locator('input[name="id"]').inputValue();
	const refused = await page.request.post(`${personUrl}?/editInteraction`, {
		form: { id, kind: 'call', happenedAt: '2026-09-03', title: 'Rewritten by the admin' },
		headers: { origin: new URL(page.url()).origin, accept: 'text/html' }
	});
	expect(refused.status()).toBe(404);
	await page.reload();
	await appReady(page);
	await expect(item(page, old)).toHaveCount(1);

	// Nina corrects kind, day, title, details and who was there: Cyrill instead of Berta.
	await nina.reload();
	await appReady(nina);
	await editOn(nina, old).click();
	const editor = nina.getByTestId('interaction-editor');
	await editor.getByLabel('Kind').selectOption('call');
	await fillDate(editor, 'Day', '2026-09-03');
	await editor.getByPlaceholder('What happened? (optional)').fill(fresh);
	await editor.getByPlaceholder('Details… (optional)').fill('About the move');
	await editor.getByRole('button', { name: `Remove ${BEFORE}` }).click();
	await pickPerson(editor.getByLabel('Who else was there?'), AFTER);
	await editor.getByRole('button', { name: 'Save', exact: true }).click();

	await expect(nina.getByTestId('toast-notice')).toContainText('Saved');
	await expect(editor).toHaveCount(0);
	await expect(item(nina, old)).toHaveCount(0);
	const edited = item(nina, fresh);
	await expect(edited).toContainText('Call');
	await expect(edited).toContainText('About the move');
	await expect(edited.getByRole('link', { name: AFTER })).toBeVisible();
	await expect(edited.getByRole('link', { name: BEFORE })).toHaveCount(0);
	// Moved to its new day, after the admin's on the 12th.
	const days = storyCard(nina).getByTestId('story-timeline');
	await expect(days).toContainText('3 September 2026');
	const titles = storyCard(nina).locator('[data-story-item]');
	await expect(titles.filter({ hasText: letters })).toHaveText([
		new RegExp(adminsOwn),
		new RegExp(fresh)
	]);

	// Still shared: the admin sees the new text, with the cross and no pencil.
	await page.reload();
	await appReady(page);
	await expect(removeOn(page, fresh)).toHaveCount(1);
	await expect(editOn(page, fresh)).toHaveCount(0);
	await nina.context().close();
});

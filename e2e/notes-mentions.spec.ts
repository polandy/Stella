import { expect, test, type Page } from '@playwright/test';
import { appReady, openPerson, signIn } from './app';

/*
 * Naming a person inside a note (docs/02 §2.5, §2.20.1). Written after the flow was verified
 * in the running app (docs/08 §8.4.1).
 *
 * The suite shares one demo database and runs serially, so this file puts back what it
 * changes: the note it writes lives on Heidi Lehmann, whom no other case reads, and the
 * person it renames is Kurt Lehmann, whom no other case names at all.
 *
 * The body is deliberately written with words the Brunners never use, so a search hit can
 * only be this note.
 */

// The note written by the first case is what the rest read, so a failure early on must stop
// the file rather than report four more failures about a note that was never written.
test.describe.configure({ mode: 'serial' });

const SUBJECT = /Heidi Lehmann/;
const MENTIONED = 'Kurt Lehmann';
/*
 * Searched for instead of his first name: the demo seed builds contact ids out of first
 * names, and an id survives the token strip as a word. Searching "Kurt" would therefore pass
 * against a raw-body index too — green for the wrong reason. His surname is in the index only
 * because the mention put it there.
 */
const MENTIONED_SURNAME = 'Lehmann';
const RENAMED = 'Kurt Bosshard';
const MARKER = 'Briefkasten';
const BODY = `${MARKER} repariert mit `;

/** Opens the Notes tab of the person whose page is showing. */
async function openNotes(page: Page): Promise<void> {
	await page.getByRole('tab', { name: /Notes/ }).click();
	await expect(page.getByRole('tab', { name: /Notes/ })).toHaveAttribute('aria-selected', 'true');
}

/** The chip a mention renders as, inside the note's body rather than anywhere else. */
function chip(page: Page) {
	return page.locator('.note-body a.mention');
}

/** Writes the note, picking the mentioned person from the @-list rather than typing them. */
async function writeTheNote(page: Page): Promise<void> {
	await openNotes(page);
	await page.getByRole('button', { name: 'Add note' }).click();
	const field = page.getByRole('textbox', { name: 'Note' });
	await field.fill(BODY);
	await field.pressSequentially('@Kurt');
	await page.getByTestId('mention-picker').getByRole('option', { name: MENTIONED }).click();
	// The picker inserts the handle without a space, which is the form the resolver reads.
	await expect(field).toHaveValue(`${BODY}@KurtLehmann `);
	await page.getByRole('button', { name: 'Add note' }).click();
	await expect(page.getByTestId('toast-notice')).toContainText('Saved');
}

/** Renames the person whose page is showing, through the heading's own inline editor. */
async function rename(page: Page, from: string, to: string): Promise<void> {
	await page.getByRole('button', { name: from }).click();
	await page.getByRole('textbox', { name: 'Edit name' }).fill(to);
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByRole('heading', { name: to })).toBeVisible();
}

/*
 * The one search result that can only be this note. Counting a filtered locator rather than
 * looking inside the Notes section on purpose: the seeded notes mention the neighbours by
 * name, so a section that merely *has* results says nothing about whether ours is among them.
 */
function hitForOurNote(page: Page) {
	return page.getByRole('link').filter({ hasText: MARKER });
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('turns a name picked from the @-list into a link to that person', async ({ page }) => {
	await openPerson(page, SUBJECT);
	await writeTheNote(page);

	// Saving lands back on the story, so the note is read where it lives.
	await openNotes(page);
	await expect(page.getByText(MARKER)).toBeVisible();
	await expect(chip(page)).toHaveText(`@${MENTIONED}`);

	await chip(page).click();
	await expect(page.getByRole('heading', { name: MENTIONED })).toBeVisible();
});

test('finds the note by the name it mentions, which its stored text does not contain', async ({
	page
}) => {
	await page.goto(`/search?q=${MENTIONED_SURNAME}`);
	await expect(hitForOurNote(page)).toHaveCount(1);
});

test('does not index the mention token as the word “contact”', async ({ page }) => {
	await page.goto('/search?q=contact');
	await expect(hitForOurNote(page)).toHaveCount(0);

	// Positive control: the rest of that same body is indexed, so the empty result above is
	// the token being stripped and not the search being broken.
	await page.goto(`/search?q=${encodeURIComponent(MARKER)}`);
	await expect(hitForOurNote(page)).toHaveCount(1);
});

test('follows a rename of the mentioned person, in the chip and in the search', async ({ page }) => {
	await openPerson(page, new RegExp(MENTIONED));
	await rename(page, MENTIONED, RENAMED);

	await openPerson(page, SUBJECT);
	await openNotes(page);
	await expect(chip(page)).toHaveText(`@${RENAMED}`);

	await page.goto('/search?q=Bosshard');
	await expect(hitForOurNote(page)).toHaveCount(1);
	// The old name goes with it: only the id was ever stored.
	await page.goto(`/search?q=${encodeURIComponent(MENTIONED)}`);
	await expect(hitForOurNote(page)).toHaveCount(0);

	// Put him back, so the rest of the suite meets the household the seed left behind.
	await openPerson(page, new RegExp(RENAMED));
	await rename(page, RENAMED, MENTIONED);
	await openPerson(page, SUBJECT);
	await openNotes(page);
	await expect(chip(page)).toHaveText(`@${MENTIONED}`);
});

test('offers the same picker in the journal composer, which had none', async ({ page }) => {
	await openPerson(page, SUBJECT);
	await page.getByRole('link', { name: 'Write' }).first().click();
	await appReady(page);
	// The composer sits behind a button, so the journal opens as a list rather than a form.
	await page.getByRole('button', { name: 'New entry' }).click();

	const field = page.getByRole('textbox', { name: 'Entry' });
	await field.pressSequentially('@Kurt');
	await expect(page.getByTestId('mention-picker').getByRole('option', { name: MENTIONED })).toBeVisible();

	// Nothing is written: the picker is dismissed and the entry never saved.
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('mention-picker')).toHaveCount(0);
});

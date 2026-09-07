import { expect, test, type Page } from '@playwright/test';
import { appReady, openPerson, signIn } from './app';
import { dayLabel } from '../src/lib/dates/labels';

/*
 * The passive side of an @-mention (docs/02 §2.20.1): the list on the person who was named.
 * Written after the maintainer read it in the running app (docs/08 §8.4.1).
 *
 * The suite shares one demo database, so the two people here are invented and appear in no
 * seed and in no other spec: everything the list must show is written by these cases, and the
 * counts they assert are therefore exact. One case reads the seeded household instead, because
 * the demo data has people naming each other and the tab must not be empty on a fresh install.
 *
 * What one login cannot prove: that another member never sees a private entry in their list.
 * The demo seed offers one-click login only for the admin, so the private case below asserts
 * the half that is reachable — the author does see it, marked as private. The other half is
 * covered where it is decided, in `mentioned-in-repository.test.ts`.
 */

// The list is built up case by case, so a failure early on must stop the file rather than
// report four more failures about entries that were never written.
test.describe.configure({ mode: 'serial' });

/** Whose journal and notes do the naming. */
const WRITER = 'Fabian Ineichen';
/** Who gets named, and whose page the list is read on. */
const NAMED = 'Rosmarie Tschopp';
/** The handle the picker inserts for her. */
const HANDLE = '@RosmarieTschopp';

const NOTE_MARKER = 'Znacht';
const ENTRY_MARKER = 'Wohlensee';
const PRIVATE_MARKER = 'Bircher';

/** Adds a person and lands on their page. */
async function addPerson(page: Page, first: string, last: string): Promise<void> {
	await page.goto('/contacts/new');
	await page.getByLabel('First name').fill(first);
	await page.getByLabel('Last name').fill(last);
	await page.getByRole('button', { name: 'Add person' }).click();
	await expect(page.getByRole('heading', { name: `${first} ${last}` })).toBeVisible();
	await appReady(page);
}

/** Opens the *Mentioned in* tab of the person whose page is showing. */
async function openMentions(page: Page): Promise<void> {
	await page.getByRole('tab', { name: /Mentioned in/ }).click();
	await expect(page.getByRole('tab', { name: /Mentioned in/ })).toHaveAttribute(
		'aria-selected',
		'true'
	);
}

/** The rows of the list, optionally only those from one kind of writing. */
function references(page: Page, kind?: 'note' | 'journal') {
	const list = page.getByTestId('mentioned-in');
	return kind ? list.locator(`a[data-kind="${kind}"]`) : list.locator('a[data-kind]');
}

/** Writes a note on the person whose page is showing, naming `NAMED` through the picker. */
async function writeNote(page: Page, text: string): Promise<void> {
	await page.getByRole('tab', { name: /Notes/ }).click();
	await page.getByRole('button', { name: 'Add note' }).click();
	const field = page.getByRole('textbox', { name: 'Note' });
	await field.fill(`${text} mit `);
	await field.pressSequentially('@Rosmarie');
	await page.getByTestId('mention-picker').getByRole('option', { name: NAMED }).click();
	await expect(field).toHaveValue(`${text} mit ${HANDLE} `);
	await page.getByRole('button', { name: 'Add note' }).click();
	await expect(page.getByTestId('toast-notice')).toContainText('Saved');
}

/** Writes a journal entry on the person whose page is showing, naming `NAMED`. */
async function writeEntry(page: Page, text: string, visibility: 'shared' | 'private'): Promise<void> {
	await page.getByRole('link', { name: 'Write' }).first().click();
	await appReady(page);
	await page.getByRole('button', { name: 'New entry' }).click();

	const field = page.getByRole('textbox', { name: 'Entry' });
	await field.fill(`${text} mit `);
	await field.pressSequentially('@Rosmarie');
	await page.getByTestId('mention-picker').getByRole('option', { name: NAMED }).click();
	if (visibility === 'private') {
		await page.getByRole('radio', { name: /Private/ }).check();
	}
	await page.getByRole('button', { name: 'Save entry' }).click();
	await expect(page.getByText(text)).toBeVisible();
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('says plainly that nobody has named this person yet', async ({ page }) => {
	await addPerson(page, 'Fabian', 'Ineichen');
	await addPerson(page, 'Rosmarie', 'Tschopp');

	await openMentions(page);
	await expect(references(page)).toHaveCount(0);
	await expect(page.getByText(`Nobody has mentioned ${NAMED} anywhere else yet.`)).toBeVisible();
	// The count sits on the tab and is exact, so an empty list says zero rather than nothing.
	await expect(page.getByRole('tab', { name: /Mentioned in/ })).toContainText('0');
});

test('puts a note on the page of the person it names, not of the person it is about', async ({
	page
}) => {
	await openPerson(page, new RegExp(WRITER));
	await writeNote(page, NOTE_MARKER);

	// The writer's own list stays empty: the note is *about* him, which is not a reference.
	await openMentions(page);
	await expect(references(page)).toHaveCount(0);

	await openPerson(page, new RegExp(NAMED));
	await openMentions(page);
	await expect(references(page, 'note')).toHaveCount(1);
	await expect(references(page, 'note')).toContainText(`in ${WRITER}’s notes`);
	await expect(references(page, 'note')).toContainText('by you');
	// The preview reads the stored token as her current name, not as `@{contact:…}`.
	await expect(references(page, 'note')).toContainText(`${NOTE_MARKER} mit @${NAMED}`);
	// A note is dated by the day it was written, which is today for one written just now.
	await expect(references(page, 'note')).toContainText(
		dayLabel(new Date().toISOString().slice(0, 10))
	);
});

test('reads a journal entry into the same list, from the same person', async ({ page }) => {
	await openPerson(page, new RegExp(WRITER));
	await writeEntry(page, ENTRY_MARKER, 'shared');

	await openPerson(page, new RegExp(NAMED));
	await openMentions(page);
	await expect(references(page)).toHaveCount(2);
	await expect(references(page, 'journal')).toHaveCount(1);
	await expect(references(page, 'journal')).toContainText(`in ${WRITER}’s journal`);
	await expect(page.getByRole('tab', { name: /Mentioned in/ })).toContainText('2');
});

test('follows a reference to where it is written', async ({ page }) => {
	await openPerson(page, new RegExp(NAMED));
	await openMentions(page);
	await references(page, 'note').click();

	// The writer's page, opened on the tab the note lives on rather than on his story.
	await expect(page.getByRole('heading', { name: WRITER })).toBeVisible();
	await expect(page.getByRole('tab', { name: /Notes/ })).toHaveAttribute('aria-selected', 'true');
	await expect(page.getByText(`${NOTE_MARKER} mit`)).toBeVisible();
});

test('marks a private entry as private in the list of the person it names', async ({ page }) => {
	await openPerson(page, new RegExp(WRITER));
	await writeEntry(page, PRIVATE_MARKER, 'private');

	await openPerson(page, new RegExp(NAMED));
	await openMentions(page);
	await expect(references(page)).toHaveCount(3);

	const secret = references(page).filter({ hasText: PRIVATE_MARKER });
	await expect(secret).toHaveCount(1);
	await expect(secret).toContainText('private');
	// The positive control: the shared entry beside it carries no such mark.
	await expect(references(page).filter({ hasText: ENTRY_MARKER })).not.toContainText('private');

	/*
	 * Measured rather than read off the markup (docs/05 §5.5): the day ends the row, and the
	 * private mark must not push it off that edge. Both boxes are laid out by the time the
	 * assertions above have passed, so there is nothing to wait for.
	 */
	const day = secret.locator('span').filter({ hasText: /\d/ }).last();
	const mark = secret.getByText('private');
	const dayBox = await day.boundingBox();
	const markBox = await mark.boundingBox();
	expect(dayBox).not.toBeNull();
	expect(markBox).not.toBeNull();
	expect(dayBox!.x).toBeGreaterThan(markBox!.x);
});

test('has something to show on a freshly seeded household', async ({ page }) => {
	await openPerson(page, /Noah Brunner/);
	await openMentions(page);

	// The seed has Markus’ journal name Noah; the demo must not open on an empty tab.
	const fromMarkus = references(page, 'journal').filter({ hasText: 'Markus Brunner' });
	await expect(fromMarkus.first()).toContainText('@Noah Brunner');
});

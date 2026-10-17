import { expect, test, type Locator, type Page } from '@playwright/test';
import { addPerson, appReady, signIn } from './app';

/*
 * Private entries veiled on their author's screen (docs/02 §2.10.1), and a note made private
 * afterwards or shared again (§2.5). Written after the flow was verified in the running app
 * (docs/08 §8.4.1). The person is the spec's own; the Settings switch is put back on before
 * the spec ends, since every other spec reads its private entries through the veil.
 */

const FIRST = 'Veronika';
const LAST = 'Schleierlein';
const SECRET = 'Veronika hides the spare key under the third pot';
const OPEN = 'Veronika likes blackberry jam';

const notesCard = (page: Page) => page.locator('#section-notes');
const note = (page: Page, text: string): Locator =>
	notesCard(page).locator('li', { hasText: text });
const veiledNote = (page: Page) =>
	notesCard(page).getByRole('button', { name: 'Private note, hidden. Show' });
const privateMark = (scope: Locator) => scope.getByTitle('Only you can see this');
const lock = (page: Page) => page.getByTestId('top-bar').getByTestId('veil-lock');

async function writeNote(page: Page, body: string, visibility: 'Shared' | 'Private') {
	await notesCard(page).getByRole('button', { name: 'Add note' }).click();
	await page.getByRole('textbox', { name: 'Note' }).fill(body);
	await notesCard(page).getByText(visibility, { exact: true }).click();
	await notesCard(page).getByRole('button', { name: 'Add note' }).click();
	await expect(page.getByRole('textbox', { name: 'Note' })).toHaveCount(0);
}

/** Saves the note's editor with the chosen visibility; the text stays as it was. */
async function setVisibility(page: Page, item: Locator, visibility: 'Shared' | 'Private') {
	await item.getByRole('button', { name: 'Edit note' }).click();
	await item.getByText(visibility, { exact: true }).click();
	await item.getByRole('button', { name: 'Save' }).click();
	await expect(item.getByRole('button', { name: 'Save' })).toHaveCount(0);
}

/** What the browser does when Stella is left for another app or tab. */
async function leaveAndComeBack(page: Page) {
	for (const state of ['hidden', 'visible'] as const) {
		await page.evaluate((s) => {
			Object.defineProperty(document, 'visibilityState', { value: s, configurable: true });
			document.dispatchEvent(new Event('visibilitychange'));
		}, state);
	}
}

async function setBlur(page: Page, on: boolean) {
	await page.goto('/settings');
	await appReady(page);
	const blur = page.getByRole('switch', { name: 'Blur my private entries' });
	if ((await blur.isChecked()) !== on) {
		await blur.click();
		await expect(
			page.getByText(
				on ? 'Your private entries are blurred again' : 'Private entries read like any other now'
			)
		).toBeVisible();
	}
	await expect(blur).toBeChecked({ checked: on });
}

test('a private note is veiled until asked for, a tap or the header lock shows it, leaving blurs it again', async ({
	page
}) => {
	await signIn(page);
	await addPerson(page, FIRST, LAST);
	await writeNote(page, SECRET, 'Private');

	// Veiled: the words are not on the page, the Private mark and the lock are.
	await expect(veiledNote(page)).toHaveCount(1);
	await expect(page.getByText(SECRET)).toHaveCount(0);
	await expect(privateMark(notesCard(page))).toBeVisible();
	await expect(lock(page)).toContainText('1 private');

	// A tap shows this one; Hide beside its mark blurs it again.
	await veiledNote(page).click();
	await expect(note(page, SECRET)).toHaveCount(1);
	await note(page, SECRET).getByRole('button', { name: 'Hide' }).click();
	await expect(page.getByText(SECRET)).toHaveCount(0);
	await expect(veiledNote(page)).toHaveCount(1);

	// The header lock shows everything for a while, counting down; a tap on it blurs again.
	await expect(lock(page)).toHaveAccessibleName('Show 1 private entry');
	await lock(page).click();
	await expect(note(page, SECRET)).toHaveCount(1);
	await expect(lock(page)).toContainText(/\d:\d\d/);
	await expect(lock(page)).toHaveAccessibleName(/^Private shown, .* left\. Blur them again$/);
	await lock(page).click();
	await expect(page.getByText(SECRET)).toHaveCount(0);

	// Leaving Stella blurs what a tap showed.
	await veiledNote(page).click();
	await expect(note(page, SECRET)).toHaveCount(1);
	await leaveAndComeBack(page);
	await expect(page.getByText(SECRET)).toHaveCount(0);
	await expect(veiledNote(page)).toHaveCount(1);
});

test('a shared note is made private afterwards, and veiled at once; shared again, it reads openly', async ({
	page
}) => {
	await signIn(page);
	await addPerson(page, FIRST, `${LAST}-Notiz`);
	await writeNote(page, OPEN, 'Shared');
	await expect(lock(page)).toHaveCount(0);

	// The person's only note, found by place: in its editor the text is a field's value.
	const item = notesCard(page).locator('li').first();
	await setVisibility(page, item, 'Private');
	await appReady(page);
	await expect(page.getByText(OPEN)).toHaveCount(0);
	await expect(veiledNote(page)).toHaveCount(1);
	await expect(lock(page)).toContainText('1 private');

	// Editing reveals it; shared again it has neither veil nor mark.
	await setVisibility(page, item, 'Shared');
	await appReady(page);
	await expect(note(page, OPEN)).toHaveCount(1);
	await expect(veiledNote(page)).toHaveCount(0);
	await expect(privateMark(item)).toHaveCount(0);
	await expect(lock(page)).toHaveCount(0);
});

test('with the Settings switch off a private note reads like any other, and on again it is veiled', async ({
	page
}) => {
	await signIn(page);
	await addPerson(page, FIRST, `${LAST}-Schalter`);
	const personUrl = page.url();
	await writeNote(page, SECRET, 'Private');
	await expect(veiledNote(page)).toHaveCount(1);

	try {
		await setBlur(page, false);
		await page.goto(personUrl);
		await appReady(page);
		await expect(note(page, SECRET)).toHaveCount(1);
		await expect(veiledNote(page)).toHaveCount(0);
		await expect(lock(page)).toHaveCount(0);
	} finally {
		await setBlur(page, true);
	}

	await page.goto(personUrl);
	await appReady(page);
	await expect(veiledNote(page)).toHaveCount(1);
	await expect(page.getByText(SECRET)).toHaveCount(0);
});

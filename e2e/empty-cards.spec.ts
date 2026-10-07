import { expect, test, type Page } from '@playwright/test';
import { addPerson, appReady, signIn } from './app';

/*
 * Empty cards on the person page (docs/05 §5.5.2, *Empty cards*): an empty Photos or Notes is
 * one line — title, one sentence, its actions — that grows into the card when *+ Add* is
 * pressed; an empty Activity keeps one dashed sentence; an empty *Mentioned in* is not on the
 * page. Written after the owner tried it in the app (docs/08 §8.4.1).
 *
 * The empty cases run on a person this attempt adds under its own letters, so nothing another
 * spec writes can fill a card. The full case reads Noah Brunner, whose seed note and the stories
 * naming him are only ever read.
 */

/** Six letters no other attempt shares. */
function runLetters(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) =>
		String.fromCharCode(97 + (byte % 26))
	).join('');
}

/** A new person with nothing on their page yet. */
async function addEmptyPerson(page: Page): Promise<void> {
	await addPerson(page, 'Ottilie', `Quarnberg${runLetters()}`);
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('an empty person’s page keeps Photos and Notes to one line and leaves Mentioned in off', async ({
	page
}) => {
	await addEmptyPerson(page);

	for (const [card, sentence, add] of [
		['photos', 'No photos yet.', 'Add photos'],
		['notes', 'Nothing noted yet.', 'Add note']
	] as const) {
		const section = page.locator(`#section-${card}`);
		await expect(section).toHaveAttribute('data-empty-line', 'true');
		const header = section.locator('header');
		await expect(header.getByText(sentence)).toBeVisible();
		await expect(header.getByRole('button', { name: add })).toBeVisible();
		// One line, no count: a zero says nothing the sentence does not.
		await expect(header).not.toContainText('0');
		await expect(section.locator(':scope > :not(header)')).toHaveCount(0);
	}

	// Activity keeps its card with one dashed sentence; *Log contact* sits in its header.
	const activity = page.locator('#section-story');
	await expect(activity).not.toHaveAttribute('data-empty-line');
	await expect(
		activity.getByText('Nothing written down yet — calls, visits and moments land here.')
	).toBeVisible();

	// Passive, with nothing to add there: at zero the card is not on the page.
	await expect(page.locator('#section-mentions')).toHaveCount(0);

	// The jump bar keeps all four cards it links: the one-line cards are where their *+ Add* is.
	await expect(page.getByTestId('jump-bar').locator('a')).toHaveText([
		/^People/,
		/^Photos/,
		/^Activity/,
		/^Notes/
	]);
});

test('an empty Notes grows into the card with its form, and the same button shrinks it back', async ({
	page
}) => {
	await addEmptyPerson(page);
	const notes = page.locator('#section-notes');
	const toggle = notes.locator('[data-section-toggle]');

	await toggle.click();
	await expect(notes).not.toHaveAttribute('data-empty-line');
	await expect(notes.getByText('Nothing noted yet.')).toHaveCount(0);
	await expect(notes.getByLabel('Note', { exact: true })).toBeVisible();
	// The add button became the form's Cancel, in the place the reader pressed.
	await expect(toggle).toHaveText('Cancel');
	await expect(toggle).toHaveAttribute('aria-expanded', 'true');

	await toggle.click();
	await expect(notes).toHaveAttribute('data-empty-line', 'true');
	await expect(notes.getByText('Nothing noted yet.')).toBeVisible();
	await expect(toggle).toHaveText('Add note');
	await expect(toggle).toBeFocused();
});

test('a person with notes and mentions keeps those cards whole', async ({ page }) => {
	await page.goto('/contacts/demo-c-noah');
	await expect(page.getByRole('heading', { name: 'Noah Brunner', exact: true })).toBeVisible();
	await appReady(page);

	const notes = page.locator('#section-notes');
	await expect(notes).not.toHaveAttribute('data-empty-line');
	await expect(notes.getByText('Fussballsaison')).toBeVisible();
	await expect(notes.getByText('Nothing noted yet.')).toHaveCount(0);

	await expect(page.locator('#section-mentions')).toBeVisible();
});

import { expect, test, type Page } from '@playwright/test';
import { addPerson, signIn } from './app';

/*
 * When a note was written (docs/02 §2.5, docs/05 §5.5): a relative word next to the title/author
 * chain, and the exact day behind it on tap — a small bubble, dismissed like a menu. Written
 * after the flow was verified in the running app (docs/08 §8.4.1).
 */

function runLetters(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) =>
		String.fromCharCode(97 + (byte % 26))
	).join('');
}

const notesCard = (page: Page) => page.locator('#section-notes');
const note = (page: Page, text: string) => notesCard(page).locator('li', { hasText: text });

async function writeNote(page: Page, text: string) {
	await notesCard(page).getByRole('button', { name: 'Add note' }).click();
	await page.getByRole('textbox', { name: 'Note' }).fill(text);
	await notesCard(page).getByRole('button', { name: 'Add note' }).click();
	await expect(note(page, text)).toHaveCount(1);
}

/** The exact day `dayLabel` would write for today, in the demo's English locale. */
function exactDay(): string {
	return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

test('a note names when it was written, and the exact day on tap', async ({ page }) => {
	const text = `notiz${runLetters()}`;

	await signIn(page);
	await addPerson(page, 'Edwina', `Prell${runLetters()}`);
	await writeNote(page, text);

	const dateBtn = note(page, text).getByRole('button', { name: `Created ${exactDay()}` });
	await expect(dateBtn).toHaveText('today');
	await expect(dateBtn).toHaveAttribute('aria-expanded', 'false');

	// Tapping it opens the exact day as a dismissable bubble, not a navigation.
	await dateBtn.click();
	await expect(dateBtn).toHaveAttribute('aria-expanded', 'true');
	const bubble = note(page, text).getByRole('status');
	await expect(bubble).toHaveText(exactDay());

	// Escape closes it and returns focus to the date.
	await page.keyboard.press('Escape');
	await expect(bubble).toHaveCount(0);
	await expect(dateBtn).toBeFocused();

	// A tap elsewhere on the page closes it too, without following any link — the note's own
	// body text, well clear of the bubble's near-miss tolerance around the date button.
	await dateBtn.click();
	await expect(bubble).toBeVisible();
	await note(page, text).locator('.note-body').click();
	await expect(bubble).toHaveCount(0);
});

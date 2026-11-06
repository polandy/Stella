import { expect, test, type Page } from '@playwright/test';
import { appReady, mention, mentionNew, openPerson, signIn } from './app';

/*
 * A moment's polish (review 2026-11, UX-03, UX-10, UX-12): edited in place from a person's
 * Activity card (docs/02 §2.23), pointed to after a save from the phone's sheet (§2.22.1), and
 * found by search with the people it mentions named (§2.9). Written after the owner's hand test
 * (docs/08 §8.4.1). Each case writes its own moment under letters no other run shares, so the
 * seed's entries stay as other specs expect them.
 */

function runLetters(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) =>
		String.fromCharCode(97 + (byte % 26))
	).join('');
}

const composerSave = (page: Page) => page.getByRole('button', { name: /^Save/ });
const storyItem = (page: Page, text: string) =>
	page.locator('[data-story-item]', { hasText: text });

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('offers the pencil on its author’s moments only', async ({ page }) => {
	// The seed's: the admin wrote the flood, Nina the knives (see story-authors.spec.ts).
	await openPerson(page, /Hans Brunner/);
	await expect(
		storyItem(page, '1972 flood').getByRole('button', { name: 'Edit moment' })
	).toHaveCount(1);
	await expect(
		storyItem(page, 'sharpened every knife').getByRole('button', { name: 'Edit moment' })
	).toHaveCount(0);
});

test('edits a moment in place from the Activity card', async ({ page }) => {
	const letters = runLetters();
	const first = `Ottilie${letters}`;
	await page.getByLabel('What happened?').pressSequentially('Baked bread with ');
	await mentionNew(page, first);
	await page.getByLabel('What happened?').pressSequentially(`, rye ${letters}`);
	await composerSave(page).click();

	const moment = page.locator('article', { hasText: `rye ${letters}` });
	// The stream's link opens the journal; the Activity card is on the person's own page.
	await moment.getByRole('link', { name: first }).first().click();
	await page.waitForURL(/\/contacts\/[^/?#]+/);
	await page.goto(page.url().replace(/(\/contacts\/[^/?#]+).*$/, '$1'));
	await appReady(page);

	const item = storyItem(page, `rye ${letters}`);
	await item.getByRole('button', { name: 'Edit moment' }).click();
	const editor = page.getByTestId('journal-entry-editor');
	// The journal's own editor, its mention shown as the handle rather than the stored token.
	await expect(editor.getByRole('textbox', { name: 'Moment' })).toHaveValue(
		new RegExp(`@${first}`)
	);

	// Cancel leaves the moment as it was.
	await editor.getByRole('button', { name: 'Cancel' }).click();
	await expect(editor).toHaveCount(0);
	await expect(item).toContainText(`rye ${letters}`);

	await item.getByRole('button', { name: 'Edit moment' }).click();
	const field = page.getByTestId('journal-entry-editor').getByRole('textbox', { name: 'Moment' });
	await field.press('End');
	await field.pressSequentially(' and spelt');
	await page.getByRole('button', { name: 'Save changes' }).click();

	await expect(page.getByTestId('journal-entry-editor')).toHaveCount(0);
	await expect(storyItem(page, `rye ${letters} and spelt`)).toHaveCount(1);
	await expect(
		storyItem(page, `rye ${letters} and spelt`).getByRole('link', { name: first })
	).not.toHaveCount(0);
});

test('names the people a moment mentions in its search snippet', async ({ page }) => {
	const word = `wandered${runLetters()}`;
	await page.getByLabel('What happened?').pressSequentially(`${word} along the lake with `);
	await mention(page, 'Lena', /Lena Brunner/);
	await composerSave(page).click();
	await expect(page.locator('article', { hasText: word })).toHaveCount(1);

	await page.goto(`/search?q=${word}`);
	const hit = page.getByRole('link', { name: new RegExp(word) });
	await expect(hit).toHaveCount(1);
	// Named as the chip names her, not left out as the index's own snippet did.
	await expect(hit).toContainText(`${word} along the lake with @Lena Brunner`);
});

test.describe('on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test('a moment saved from the sheet says so, and Show leads to it', async ({ page }) => {
		const words = `picked plums ${runLetters()}`;
		await page.locator('nav').getByRole('link', { name: 'Write a moment' }).click();
		await expect(page.getByTestId('compose-sheet')).toBeVisible();
		await page.getByLabel('What happened?').pressSequentially(`${words} with `);
		await mention(page, 'Lena', /Lena Brunner/);
		await composerSave(page).click();

		const toast = page.getByTestId('toast-notice');
		await expect(toast).toContainText('Moment saved');
		await toast.getByRole('link', { name: 'Show' }).click();

		await expect(page).toHaveURL(/#moment-[^/]+$/);
		const row = page.locator('article', { hasText: words });
		await expect(row).toBeInViewport();
		// The row the hash names is the one flashed (`:target`, docs/05 §5.7).
		expect(await row.evaluate((el) => el.matches(':target'))).toBe(true);
	});
});

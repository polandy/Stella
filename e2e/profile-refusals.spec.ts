import { expect, test } from '@playwright/test';
import { addPerson, appReady, signIn } from './app';

/*
 * What the hero of a person's page does with a form it would not expect (docs/02 §2.2): the
 * description is trimmed by the save itself, and a gender other than the three refuses the whole
 * name edit before anything is written. Written after the maintainer checked the editors in the
 * running app (docs/08 §8.4.1).
 *
 * The suite shares one database, so every case writes on a person of its own.
 */

/** Six letters no other attempt shares, so a name made from them is this attempt's alone. */
function runLetters(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) =>
		String.fromCharCode(97 + (byte % 26))
	).join('');
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('saves a description without the spaces around it', async ({ page }) => {
	await addPerson(page, 'Ottilie', `Gfeller${runLetters()}`);

	await page.getByRole('button', { name: 'Add a description' }).click();
	await page.getByRole('textbox', { name: 'Edit description' }).fill('  Plays the alphorn  ');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Plays the alphorn')).toBeVisible();

	await page.reload();
	await appReady(page);
	await page.getByRole('button', { name: 'Plays the alphorn' }).click();
	await expect(page.getByRole('textbox', { name: 'Edit description' })).toHaveValue(
		'Plays the alphorn'
	);
});

test('refuses a gender it does not know, and keeps the name as it was', async ({
	page,
	baseURL
}) => {
	const last = `Gfeller${runLetters()}`;
	await addPerson(page, 'Ottilie', last);
	const person = new URL(page.url()).pathname;

	// Posted straight at the action: the editor only ever offers the three and *Not on record*,
	// so this is the guard against a hand-made form.
	const response = await page.request.post(`${person}?/editNameParts`, {
		form: {
			firstName: 'Renamed',
			lastName: last,
			nickname: '',
			displayName: '',
			formerName: '',
			gender: 'other'
		},
		headers: { origin: baseURL! }
	});
	expect(response.status()).toBe(400);

	// The positive control: the page still renders, under the name it had.
	await page.reload();
	await appReady(page);
	await expect(page.getByRole('heading', { name: `Ottilie ${last}` })).toBeVisible();
});

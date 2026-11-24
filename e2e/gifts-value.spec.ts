import { expect, test, type Page } from '@playwright/test';
import { addPerson, appReady, signIn } from './app';

/*
 * What a gift was worth (docs/dev/02 §2.25.16): an optional whole number under *Note or link*,
 * shown after the title in the instance's currency on the person's card and on *All gift ideas*;
 * anything but a whole number is refused. The person is the run's own, since the suite shares one
 * database.
 */

/** Six letters no other attempt shares. */
function runLetters(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) =>
		String.fromCharCode(97 + (byte % 26))
	).join('');
}

/** Opens *+ Idea* on the person's Gifts card, names it and types `value` into the optional field. */
async function fillIdea(page: Page, title: string, value: string) {
	const card = page.locator('#section-gifts');
	await card.getByRole('button', { name: 'Idea', exact: true }).click();
	const form = card.getByTestId('gift-form');
	await form.getByLabel('What?').fill(title);
	await form.getByRole('button', { name: 'Note or link' }).click();
	await form.getByLabel('Value').fill(value);
	return { card, form };
}

test('a whole-number value shows after the title, in the currency, on the card and on the list', async ({
	page
}) => {
	await signIn(page);
	const letters = runLetters();
	const person = `Quendt Wertig${letters}`;
	await addPerson(page, 'Quendt', `Wertig${letters}`);
	const teapot = `Teapot ${letters}`;
	const kite = `Kite ${letters}`;

	// Thousands marks are ignored.
	const { card, form } = await fillIdea(page, teapot, "1'250");
	await form.getByRole('button', { name: 'Save' }).click();
	const row = card.getByTestId('gift-ideas').locator('li', { hasText: teapot });
	await expect(row.getByTestId('gift-value')).toHaveText(/^· 1\D?250 CHF$/);

	// No value is the normal case: nothing after the title.
	await card.getByRole('button', { name: 'Idea', exact: true }).click();
	await card.getByTestId('gift-form').getByLabel('What?').fill(kite);
	await card.getByTestId('gift-form').getByRole('button', { name: 'Save' }).click();
	const bare = card.getByTestId('gift-ideas').locator('li', { hasText: kite });
	await expect(bare).toHaveCount(1);
	await expect(bare.getByTestId('gift-value')).toHaveCount(0);

	// The household's list shows it too.
	await page.goto('/gifts');
	await appReady(page);
	const group = page
		.getByTestId('gift-list-group')
		.filter({ has: page.getByRole('heading', { name: person }) });
	await expect(group.locator('li', { hasText: teapot }).getByTestId('gift-value')).toHaveText(
		/1\D?250 CHF/
	);
	await expect(group.locator('li', { hasText: kite }).getByTestId('gift-value')).toHaveCount(0);
});

test('a value that is not a whole number is refused and nothing is saved', async ({ page }) => {
	await signIn(page);
	const letters = runLetters();
	await addPerson(page, 'Zora', `Wertig${letters}`);
	const lamp = `Lamp ${letters}`;

	const { card, form } = await fillIdea(page, lamp, '12.50');
	await form.getByRole('button', { name: 'Save' }).click();
	await expect(card.getByRole('alert')).toHaveText('Enter a whole number, like 45.');
	await expect(card.getByTestId('gift-ideas').locator('li', { hasText: lamp })).toHaveCount(0);

	// The positive control: the same form saves once the figure is whole.
	await form.getByLabel('Value').fill('0');
	await form.getByRole('button', { name: 'Save' }).click();
	await expect(
		card.getByTestId('gift-ideas').locator('li', { hasText: lamp }).getByTestId('gift-value')
	).toHaveText('· 0 CHF');
});

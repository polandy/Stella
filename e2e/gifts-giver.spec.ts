import { expect, test, type Locator, type Page } from '@playwright/test';
import { appReady, signIn } from './app';
import { LINK, personIdOf, seedHousehold } from './seed';

/*
 * Who gives a gift (docs/dev/02 §2.25.12): *Assign…* gives an idea to one of the person's links,
 * to the household, and frees it again; *+ Given* asks whom it was from. The person is the run's
 * own, since the suite shares one database.
 */

/** Six letters no other attempt shares. */
function runLetters(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) =>
		String.fromCharCode(97 + (byte % 26))
	).join('');
}

const giftsCard = (page: Page) => page.locator('#section-gifts');
// A chip's radio is visually hidden; its label is what a finger presses.
const chip = (scope: Locator, name: string) =>
	scope.getByTestId('gift-giver').locator('label', { hasText: name });

test('an idea is given to a person, to the household, freed, and a gift given says whom from', async ({
	page
}) => {
	await signIn(page);
	const letters = runLetters();
	const name = `Tomy Geber${letters}`;
	const aunt = `Sandra Geber${letters}`;
	const puzzle = `Puzzle ${letters}`;
	const kite = `Kite ${letters}`;
	await seedHousehold(
		page,
		[name, aunt],
		[{ from: name, to: aunt, type: LINK.siblingOf }],
		{},
		[],
		[],
		[],
		{},
		{},
		{},
		{ [name]: [{ title: puzzle }] }
	);

	await page.goto(`/contacts/${personIdOf(name)}`);
	await appReady(page);
	const card = giftsCard(page);
	const row = card.getByTestId('gift-ideas').locator('li', { hasText: puzzle });

	// To a link of theirs, suggested with what she is to him.
	await row.getByTestId('gift-assign-open').click();
	const assign = row.getByTestId('gift-assign');
	await chip(assign, aunt).click();
	await assign.getByRole('button', { name: 'Assign', exact: true }).click();
	await expect(row.getByTestId('gift-giver-line')).toHaveText(`${aunt} is giving it`);

	// Moved on to the household, saying whom it replaces.
	await row.getByRole('button', { name: 'Change giver' }).click();
	await chip(assign, 'Us').click();
	await expect(assign.getByTestId('gift-assign-replaces')).toContainText(aunt);
	await assign.getByRole('button', { name: 'Assign', exact: true }).click();
	await expect(row.getByTestId('gift-giver-line')).toHaveText('We are giving it');

	// Free again.
	await row.getByRole('button', { name: 'Change giver' }).click();
	await assign.getByTestId('gift-assign-free').click();
	await expect(row.getByTestId('gift-giver-line')).toHaveCount(0);
	await expect(row.getByTestId('gift-assign-open')).toHaveText('Assign…');

	// A gift given earlier, from her.
	await card.getByRole('button', { name: 'Given', exact: true }).click();
	const form = card.getByTestId('gift-form');
	await form.getByLabel('What?').fill(kite);
	await chip(form, aunt).click();
	await form.getByRole('button', { name: 'Save' }).click();
	await expect(card.locator('li', { hasText: kite }).getByTestId('gift-giver-line')).toHaveText(
		`from ${aunt}`
	);
});

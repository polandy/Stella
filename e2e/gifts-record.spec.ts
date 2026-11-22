import { expect, test, type Page } from '@playwright/test';
import { appReady, fillDate, isoDaysAfter, pickPerson, serverToday, signIn } from './app';
import { LINK, personIdOf, seedHousehold } from './seed';

/*
 * *Record given…* (docs/dev/02 §2.25.14): a passed occasion's sheet ticks what was planned for it
 * and notes what else was given, from the card's hint; on `/gifts` a row *For: Us* is noted as
 * received from its giver. The people are the run's own, since the suite shares one database.
 */

/** Six letters no other attempt shares. */
function runLetters(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) =>
		String.fromCharCode(97 + (byte % 26))
	).join('');
}

const giftsCard = (page: Page) => page.locator('#section-gifts');
const sheet = (page: Page) => page.getByTestId('gift-record-sheet');

async function openCard(page: Page, name: string): Promise<void> {
	await page.goto(`/contacts/${personIdOf(name)}`);
	await expect(giftsCard(page)).toBeVisible();
	await appReady(page);
}

test('a passed occasion is recorded from its hint: the planned idea ticked, one more given', async ({
	page
}) => {
	await signIn(page);
	const letters = runLetters();
	const name = `Ottilie Nachtrag${letters}`;
	const aunt = `Gerda Nachtrag${letters}`;
	const kite = `Kite ${letters}`;
	const puzzle = `Puzzle ${letters}`;
	const passed = isoDaysAfter(await serverToday(page), -3);
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
		{ [name]: [{ title: kite, when: { kind: 'on_date', on: passed } }] }
	);
	await openCard(page, name);

	await giftsCard(page).getByTestId('gift-occasion-over').getByRole('button').click();
	const opened = sheet(page);
	await expect(opened.getByRole('heading', { name: `Record gifts for ${name}` })).toBeVisible();
	// A free idea may not have been given: it waits to be ticked.
	const planned = opened.getByRole('checkbox', { name: `“${kite}” was given` });
	await expect(planned).not.toBeChecked();
	await planned.check();

	const row = opened.getByTestId('gift-record-row').first();
	await row.getByPlaceholder('What?').fill(puzzle);
	await row.getByTestId('gift-giver').locator('label', { hasText: aunt }).click();
	await opened.getByRole('button', { name: 'Record 2', exact: true }).click();

	await expect(page.getByTestId('toast-notice')).toContainText('2 gifts recorded');
	await expect(opened).toBeHidden();
	await giftsCard(page)
		.getByRole('tab', { name: /^Given/ })
		.click();
	await expect(giftsCard(page).getByText(kite)).toBeVisible();
	await expect(giftsCard(page).getByText(puzzle)).toBeVisible();
});

test('on /gifts a gift for us on another day is noted as received from its giver', async ({
	page
}) => {
	await signIn(page);
	const letters = runLetters();
	const giver = `Hermine Schenker${letters}`;
	const book = `Book ${letters}`;
	const day = isoDaysAfter(await serverToday(page), -2);
	await seedHousehold(page, [giver]);
	await page.goto('/gifts');
	await appReady(page);

	await page.getByTestId('gift-record-open').click();
	const opened = sheet(page);
	await expect(opened.getByRole('heading', { name: 'Record gifts', exact: true })).toBeVisible();
	await opened.getByRole('button', { name: 'Another day…' }).click();
	await fillDate(opened, 'Day', day);

	const row = opened.getByTestId('gift-record-row').first();
	await row.getByPlaceholder('What?').fill(book);
	await row.getByTestId('gift-record-for-us').click();
	await expect(row.getByTestId('gift-record-need-giver')).toBeVisible();
	await pickPerson(row.getByLabel('Someone else…'), giver);
	await expect(row.getByText(`Noted on ${giver} under “Received”.`)).toBeVisible();
	await opened.getByRole('button', { name: 'Record 1', exact: true }).click();

	await expect(page.getByTestId('toast-notice')).toContainText('1 gift recorded');
	await openCard(page, giver);
	await giftsCard(page)
		.getByRole('tab', { name: /^Received/ })
		.click();
	await expect(giftsCard(page).getByText(book)).toBeVisible();
});

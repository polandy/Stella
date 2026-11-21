import { expect, test, type Locator, type Page } from '@playwright/test';
import { appReady, isoDaysAfter, serverToday, signIn } from './app';
import { LINK, personIdOf, seedHousehold } from './seed';
import { UNDO_WINDOW_MS } from '../src/lib/undo/pending-removals';

/*
 * The Gifts card by occasion (docs/dev/02 §2.25.13): once an idea has a giver or a day, every open
 * and bought gift stands under its occasion with a tally. A gift someone outside the household
 * gives is *Done* in one tap; one the household hands over is *Bought…* with where it waits
 * (§2.25.9). The person is the run's own, since the suite shares one database.
 */

/** Six letters no other attempt shares. */
function runLetters(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) =>
		String.fromCharCode(97 + (byte % 26))
	).join('');
}

const giftsCard = (page: Page) => page.locator('#section-gifts');

/** Lets the held answer go once its undo window has closed, and waits for it to arrive. */
async function commitHeld(page: Page): Promise<void> {
	const committed = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' && response.url().includes('markGiftBought')
	);
	await page.clock.runFor(UNDO_WINDOW_MS + 1);
	await committed;
}

/** Every row of the card naming `title`, open or bought. */
const rowOf = (card: Locator, title: string) => card.locator('li', { hasText: title });

test('the card groups by occasion, a giver’s gift is done, and ours is bought with its place', async ({
	page
}, testInfo) => {
	await signIn(page);
	const today = await serverToday(page);
	const day = isoDaysAfter(today, 30);
	const letters = runLetters();
	const name = `Ottilie Anlass${letters}`;
	const aunt = `Gesine Anlass${letters}`;
	const kite = `Kite ${letters}`;
	const book = `Book ${letters}`;
	const socks = `Socks ${letters}`;
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
		{
			[name]: [
				{ title: kite, when: { kind: 'on_date', on: day } },
				{ title: book, when: { kind: 'on_date', on: day } },
				{ title: socks }
			]
		}
	);
	await page.goto(`/contacts/${personIdOf(name)}`);
	await appReady(page);
	const card = giftsCard(page);

	// Grouped: the day's two ideas under it, both free; the socks without an occasion, last.
	const groups = card.getByTestId('gift-occasion');
	await expect(groups).toHaveCount(2);
	await expect(groups.first()).toContainText('in 30 days');
	await expect(groups.first().getByTestId('gift-tally')).toHaveText('0 done · 0 assigned · 2 free');
	await expect(rowOf(groups.first(), kite).getByTestId('gift-free')).toHaveText('still free');
	await expect(groups.last()).toContainText('Without an occasion');
	await expect(groups.last().getByTestId('gift-tally')).toHaveCount(0);
	await expect(rowOf(groups.last(), socks)).toHaveCount(1);

	// The aunt gives the kite: assigned, and done in one tap — no place to ask for.
	const kiteRow = rowOf(card, kite);
	await kiteRow.getByTestId('gift-assign-open').click();
	const assign = kiteRow.getByTestId('gift-assign');
	await assign.getByTestId('gift-giver').locator('label', { hasText: aunt }).click();
	await assign.getByRole('button', { name: 'Assign', exact: true }).click();
	await expect(groups.first().getByTestId('gift-tally')).toHaveText('0 done · 1 assigned · 1 free');
	await expect(kiteRow.getByTestId('gift-buy-open')).toHaveCount(0);

	await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
	await kiteRow.getByTestId('gift-bought').click();
	await expect(page.getByTestId('toast-undo')).toContainText(`“${kite}” done`);
	await commitHeld(page);

	// The book is ours to hand over: *Bought…* asks where it waits.
	await rowOf(card, book).getByTestId('gift-buy-open').click();
	const sheet = rowOf(card, book).getByTestId('gift-buy');
	await sheet.getByLabel('Where is it kept? (optional)').fill(`Attic ${letters}`);
	await sheet.getByTestId('gift-buy-save').click();
	await commitHeld(page);
	await page.clock.resume();

	// Both done, at the end of their group; the kite's undo says done, the book's bought.
	await expect(groups.first().getByTestId('gift-tally')).toHaveText('2 done · 0 assigned · 0 free');
	const ready = groups.first().getByTestId('gift-ready');
	await expect(rowOf(ready, kite).getByTestId('gift-not-bought')).toHaveText('Not done yet');
	await expect(rowOf(ready, book).getByTestId('gift-not-bought')).toHaveText('Not bought yet');
	await expect(rowOf(ready, book).getByTestId('gift-stored-at')).toContainText(`Attic ${letters}`);
	await card.screenshot({ path: testInfo.outputPath('card-by-occasion.png') });

	// The place is offered again on the next *Bought…*.
	await rowOf(card, socks).getByTestId('gift-buy-open').click();
	await expect(
		rowOf(card, socks)
			.getByTestId('gift-buy-places')
			.getByRole('button', { name: `Attic ${letters}` })
	).toBeVisible();
});

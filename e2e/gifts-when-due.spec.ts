import { expect, test, type Page } from '@playwright/test';
import { appReady, isoDaysAfter, serverToday, signIn } from './app';
import { personIdOf, seedHousehold } from './seed';

// An idea comes due, and one whose time went by asks (docs/dev/02 §2.25.8); days count from the server's.

/** Six letters no other attempt shares. */
function runLetters(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) =>
		String.fromCharCode(97 + (byte % 26))
	).join('');
}

const giftsCard = (page: Page) => page.locator('#section-gifts');

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('a soon idea counts again with its day ahead, and a passed or yearly one asks until answered', async ({
	page
}, testInfo) => {
	const today = await serverToday(page);
	const birthday = isoDaysAfter(today, 34);
	// No 29 February: six years back it may not exist.
	test.skip(birthday.slice(5) === '02-29', 'a leap-day birthday shifts the count');
	const born = `${Number(birthday.slice(0, 4)) - 6}${birthday.slice(4)}`;
	const letters = runLetters();
	const name = `Fenja Fällig${letters}`;
	const bike = `Bike ${letters}`;
	await seedHousehold(
		page,
		[name],
		[],
		{},
		[],
		[],
		[],
		{ [name]: born },
		{},
		{},
		{
			[name]: [
				{ title: bike, when: { kind: 'at_age', age: 6 } },
				{
					title: 'Snow globe',
					when: { kind: 'on_date', on: isoDaysAfter(today, -3) },
					createdAt: `${isoDaysAfter(today, -60)}T12:00:00Z`
				},
				{
					title: 'Telescope',
					when: { kind: 'later' },
					createdAt: `${isoDaysAfter(today, -400)}T12:00:00Z`
				},
				{ title: 'Kite', when: { kind: 'at_age', age: 9 } }
			]
		}
	);
	await page.goto(`/contacts/${personIdOf(name)}`);
	await appReady(page);
	const card = giftsCard(page);
	const ideas = card.getByTestId('gift-ideas');

	// Only the kite still waits; the other three are open and counted.
	await expect(card.getByRole('tab', { name: 'Ideas' })).toHaveText('Ideas · 3');
	await expect(card.getByTestId('gift-later')).toHaveText('Later · 1');
	const row = (title: string) => ideas.locator('li', { hasText: title });
	await expect(row(bike).getByTestId('when-chip')).toHaveText('For the 6th birthday · in 34 days');
	await expect(row('Snow globe').getByTestId('when-chip')).toContainText('· passed');
	await expect(row('Telescope').getByTestId('when-chip')).toHaveText('Later');
	await expect(row(bike).getByTestId('when-ask')).toHaveCount(0);
	await expect(ideas.getByTestId('when-ask')).toHaveCount(2);
	await expect(row('Snow globe').getByTestId('when-ask')).toContainText(
		'The occasion has passed. Still current?'
	);
	await expect(row('Telescope').getByTestId('when-ask')).toContainText(
		'Noted for later. Still current?'
	);
	await card.screenshot({ path: testInfo.outputPath('card-due.png') });

	// Kept as a plain idea: the when goes, and so does the question.
	await row('Snow globe').getByRole('button', { name: 'Keep as idea' }).click();
	await expect(row('Snow globe').getByTestId('when-ask')).toHaveCount(0);
	await expect(row('Snow globe').getByTestId('when-chip')).toHaveCount(0);

	// Moved to later again: answered, it waits a year under the fold.
	const ask = row('Telescope').getByTestId('when-ask');
	await ask.getByRole('button', { name: 'New time' }).click();
	await ask.getByTestId('when-picker').getByText('Later', { exact: true }).click();
	await ask.getByRole('button', { name: 'Save' }).click();
	await expect(card.getByTestId('gift-later')).toHaveText('Later · 2');
	await expect(card.getByRole('tab', { name: 'Ideas' })).toHaveText('Ideas · 2');
	await expect(ideas.getByTestId('when-ask')).toHaveCount(0);

	// On the household's list the soon one stands with its day ahead.
	await page.goto('/gifts');
	await appReady(page);
	const listed = page.locator('li', { hasText: bike });
	await expect(listed.getByTestId('when-chip')).toHaveText('For the 6th birthday · in 34 days');
	await page.screenshot({ path: testInfo.outputPath('gifts-list.png') });
});

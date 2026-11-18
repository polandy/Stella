import { expect, test, type Page } from '@playwright/test';
import { appReady, isoDaysAfter, serverToday, signIn } from './app';
import { LINK, personIdOf, seedHousehold } from './seed';

// One idea for several people (docs/dev/02 §2.25.11); ages count from the server's day.

/** Six letters no other attempt shares. */
function runLetters(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) =>
		String.fromCharCode(97 + (byte % 26))
	).join('');
}

const rowOf = (page: Page, name: string) =>
	page.locator(`[data-testid="group-row"][data-person="${personIdOf(name)}"]`);

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('one idea for a parent’s children: each previewed, the grey ones helped, noted for all three', async ({
	page
}, testInfo) => {
	const today = await serverToday(page);
	const birthday = isoDaysAfter(today, 40);
	test.skip(birthday.slice(5) === '02-29', 'a leap-day birthday shifts the count');
	const letters = runLetters();
	const anna = `Anna Elter${letters}`;
	const mia = `Mia Elter${letters}`;
	const ben = `Ben Elter${letters}`;
	const noah = `Noah Elter${letters}`;
	await seedHousehold(
		page,
		[anna, mia, ben, noah],
		[mia, ben, noah].map((child) => ({ from: anna, to: child, type: LINK.parentOf })),
		{},
		[],
		[],
		[],
		{
			// Mia turns 3 in forty days; Ben is long past 3; Noah has no birth date.
			[mia]: `${Number(birthday.slice(0, 4)) - 3}${birthday.slice(4)}`,
			[ben]: `${Number(today.slice(0, 4)) - 9}-06-15`
		}
	);

	// From Mia's Gifts card: she is ticked, and her parent's children are one tap away.
	await page.goto(`/contacts/${personIdOf(mia)}`);
	await appReady(page);
	const card = page.locator('#section-gifts');
	await card.getByRole('button', { name: 'More for gifts' }).click();
	await page.getByRole('menuitem', { name: 'For several…' }).click();
	await expect(page).toHaveURL(new RegExp(`/gifts/several\\?for=${personIdOf(mia)}$`));
	const form = page.getByTestId('gift-group-form');
	await expect(page.getByTestId('group-row')).toHaveCount(1);

	await form.getByLabel('What?').fill(`Puzzle ${letters}`);
	const children = form
		.getByTestId('group-shortcuts')
		.getByRole('button', { name: `Children of ${anna}` });
	await expect(children).toHaveAttribute('aria-pressed', 'false');
	await children.click();
	await expect(children).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByTestId('group-row')).toHaveCount(3);

	// For the third birthday: Mia fits, Ben is too old, Noah has no year to count from.
	const picker = form.getByTestId('when-picker');
	await picker.getByText('For a birthday', { exact: true }).click();
	await picker.getByRole('button', { name: 'One year older' }).click();
	await picker.getByRole('button', { name: 'One year older' }).click();
	await expect(picker.getByTestId('when-age')).toHaveText('3');
	await expect(rowOf(page, mia).getByTestId('group-row-line')).toContainText('Turns 3 on');
	await expect(rowOf(page, mia)).toHaveAttribute('data-chosen', 'true');
	await expect(rowOf(page, ben)).toHaveAttribute('data-chosen', 'false');
	await expect(rowOf(page, noah)).toHaveAttribute('data-chosen', 'false');
	const summary = page.getByTestId('group-summary');
	await expect(summary).toContainText('For 1 of 3');
	await expect(summary).toContainText(`too old: ${ben}`);
	await expect(summary).toContainText(`no birth year for ${noah}`);
	await page.screenshot({ path: testInfo.outputPath('group-grey.png'), fullPage: true });

	// Ben gets it now instead; Noah's age today stands in for a birth year.
	await rowOf(page, ben)
		.getByTestId('group-row-instead')
		.getByRole('button', { name: 'now' })
		.click();
	await expect(rowOf(page, ben)).toHaveAttribute('data-chosen', 'true');
	await expect(rowOf(page, ben)).toContainText('own time');
	await rowOf(page, noah).getByTestId('group-row-age').fill('1');
	await expect(rowOf(page, noah)).toHaveAttribute('data-chosen', 'true');
	await expect(rowOf(page, noah).getByTestId('group-row-estimate')).toContainText(
		`about ${Number(today.slice(0, 4)) - 1}`
	);
	await expect(summary).toHaveText('For 3');
	await page.screenshot({ path: testInfo.outputPath('group-ready.png'), fullPage: true });

	await form.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Noted for 3')).toBeVisible();
	await expect(page).toHaveURL(new RegExp(`/contacts/${personIdOf(mia)}#section-gifts$`));
	await expect(card.getByText(`Puzzle ${letters}`)).toBeVisible();

	// Noted on Ben's card as well, and Noah's estimate kept as his birth year.
	await page.goto(`/contacts/${personIdOf(ben)}`);
	await appReady(page);
	await expect(card.getByText(`Puzzle ${letters}`)).toBeVisible();
	await page.goto(`/contacts/${personIdOf(noah)}`);
	await appReady(page);
	await expect(page.getByTestId('identity-card')).toContainText(
		String(Number(today.slice(0, 4)) - 1)
	);
});

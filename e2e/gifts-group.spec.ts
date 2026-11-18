import { expect, test, type Page } from '@playwright/test';
import { appReady, isoDaysAfter, pickPerson, serverToday, signIn } from './app';
import { LINK, personIdOf, seedHousehold } from './seed';
import { UNDO_WINDOW_MS } from '../src/lib/undo/pending-removals';

// One idea for several people (docs/dev/02 §2.25.11), kept through the outbox (§2.18); ages count from the server's day.

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

test('an idea for several kept while Stella is out of reach waits on Home, then is noted for each', async ({
	page
}) => {
	const letters = runLetters();
	const tim = `Tim Ferner${letters}`;
	const ida = `Ida Ferner${letters}`;
	const ole = `Ole Ferner${letters}`;
	await seedHousehold(
		page,
		[tim, ida, ole],
		[ida, ole].map((child) => ({ from: tim, to: child, type: LINK.parentOf }))
	);
	await page.goto(`/gifts/several?for=${personIdOf(ida)}`);
	await appReady(page);
	const form = page.getByTestId('gift-group-form');
	await form.getByLabel('What?').fill(`Kite ${letters}`);
	await form.getByRole('button', { name: `Children of ${tim}` }).click();
	await expect(page.getByTestId('group-summary')).toHaveText('For 2');

	// The way to Stella is held shut: the form keeps it and goes back to Ida's card.
	await page.route('**/api/commands', (route) => route.abort());
	await form.getByRole('button', { name: 'Save' }).click();
	await expect(page).toHaveURL(new RegExp(`/contacts/${personIdOf(ida)}#section-gifts$`));
	await page.goto('/');
	const outbox = page.getByTestId('outbox');
	await expect(outbox).toContainText(`gift for ${ida} and ${ole}`);
	await expect(outbox).toContainText(`Kite ${letters}`);

	await page.unroute('**/api/commands');
	const sent = page.waitForResponse(
		(response) => response.url().endsWith('/api/commands') && response.request().method() === 'POST'
	);
	await page.reload();
	await sent;
	await expect(outbox).toHaveCount(0);
	for (const child of [ida, ole]) {
		await page.goto(`/contacts/${personIdOf(child)}`);
		await appReady(page);
		await expect(page.locator('#section-gifts').getByText(`Kite ${letters}`)).toBeVisible();
	}
});

test('who has it: given for one, one more added, bought for all, changed for all, one detached, the open removed, dissolved', async ({
	page
}, testInfo) => {
	const letters = runLetters();
	const anna = `Anna Kerner${letters}`;
	const mia = `Mia Kerner${letters}`;
	const ben = `Ben Kerner${letters}`;
	const lea = `Lea Kerner${letters}`;
	const finn = `Finn Kerner${letters}`;
	await seedHousehold(
		page,
		[anna, mia, ben, lea, finn],
		[mia, ben, lea].map((child) => ({ from: anna, to: child, type: LINK.parentOf }))
	);
	await page.goto(`/gifts/several?for=${personIdOf(mia)}`);
	await appReady(page);
	const form = page.getByTestId('gift-group-form');
	await form.getByLabel('What?').fill(`Drum ${letters}`);
	await form.getByRole('button', { name: `Children of ${anna}` }).click();
	await form.getByRole('button', { name: 'Save' }).click();
	await expect(page).toHaveURL(new RegExp(`/contacts/${personIdOf(mia)}#section-gifts$`));

	// Mia's card names the others, and opens who has it.
	const card = page.locator('#section-gifts');
	const also = card.getByTestId('gift-also-for');
	await expect(also).toContainText(ben);
	await expect(also).toContainText(lea);
	await also.click();
	const panel = page.getByTestId('gift-group-panel');
	await expect(panel.getByRole('heading', { name: `Drum ${letters}` })).toBeVisible();
	const member = (name: string) =>
		panel.locator(`[data-testid="group-member"][data-contact="${personIdOf(name)}"]`);
	await expect(panel.getByTestId('group-member')).toHaveCount(3);

	// Ben has it now; he moves to the top as given.
	await member(ben).getByRole('button', { name: 'Mark as given…' }).click();
	await member(ben).getByRole('button', { name: 'Mark as given', exact: true }).click();
	await expect(member(ben)).toContainText('given');
	await expect(panel.getByTestId('group-member').first()).toHaveAttribute(
		'data-contact',
		personIdOf(ben)
	);

	// Finn gets it too, at the group's when.
	await panel.getByRole('button', { name: 'Person' }).click();
	await pickPerson(panel.getByTestId('gift-group-add').getByRole('combobox'), finn);
	await panel.getByRole('button', { name: 'Add (1)' }).click();
	await expect(page.getByText('Noted for 1')).toBeVisible();
	await expect(panel.getByTestId('group-member')).toHaveCount(4);
	await panel.screenshot({ path: testInfo.outputPath('who-has-it.png') });

	// Bought for the three still open, once the undo window has closed.
	await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
	await panel.getByRole('button', { name: 'Bought for everyone (3)' }).click();
	await expect(page.getByTestId('toast-undo')).toContainText('Bought for 3');
	const bought = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' && response.url().includes('markGroupBought')
	);
	await page.clock.runFor(UNDO_WINDOW_MS + 1);
	await bought;
	await page.clock.resume();
	for (const name of [mia, lea, finn]) await expect(member(name)).toContainText('bought');
	await expect(panel.getByRole('button', { name: 'Bought for everyone' })).toBeDisabled();

	// A new title for every open one; Ben's given gift stays as given.
	await panel.getByRole('button', { name: 'Change' }).click();
	await panel.getByLabel('What?').fill(`Big drum ${letters}`);
	await panel.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Changed for 3 open')).toBeVisible();
	await expect(panel.getByRole('heading', { name: `Big drum ${letters}` })).toBeVisible();

	// Lea goes on alone, and Mia's card no longer names her.
	await member(lea)
		.getByRole('button', { name: `More for ${lea}` })
		.click();
	await page.getByRole('menuitem', { name: /Detach from the others/ }).click();
	await expect(panel.getByTestId('group-member')).toHaveCount(3);
	await panel.getByRole('button', { name: 'Close' }).click();
	await expect(panel).toBeHidden();
	await expect(card.getByText(`Big drum ${letters}`)).toBeVisible();
	await expect(also).not.toContainText(lea);
	await expect(also).toContainText(finn);

	// From Ben's card the open ones go, once the undo window has closed; his given gift stays.
	await page.goto(`/contacts/${personIdOf(ben)}`);
	await appReady(page);
	await card.getByRole('tab', { name: /^Given/ }).click();
	await also.click();
	await panel.getByRole('button', { name: 'More for this idea' }).click();
	await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
	await page.getByRole('menuitem', { name: /Remove all open \(2\)/ }).click();
	const removed = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' && response.url().includes('removeGroupOpen')
	);
	await page.clock.runFor(UNDO_WINDOW_MS + 1);
	await removed;
	await page.clock.resume();
	await expect(panel.getByTestId('group-member')).toHaveCount(1);
	await expect(panel.getByText('Everyone has it')).toBeVisible();

	await expect(also).toHaveCount(0);

	// Dissolved, Ben's gift goes on alone.
	await panel.getByRole('button', { name: 'More for this idea' }).click();
	await page.getByRole('menuitem', { name: /Go on one by one/ }).click();
	await expect(panel).toBeHidden();
	await expect(page.getByTestId('toast-notice')).toContainText('Saved');
	await page.reload();
	await appReady(page);
	await card.getByRole('tab', { name: /^Given/ }).click();
	await expect(card.getByText(`Drum ${letters}`)).toBeVisible();
});

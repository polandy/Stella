import { expect, test, type Browser, type Page } from '@playwright/test';
import { appReady, isoDaysAfter, pickPerson, releaseSelfClaim, serverToday, signIn } from './app';
import { personIdOf, seedHousehold } from './seed';
import { UNDO_WINDOW_MS } from '../src/lib/undo/pending-removals';
import { DEMO_ADMIN_PASSWORD, DEMO_MEMBER_EMAIL } from '../src/lib/server/db/demo-constants';

/*
 * A gift bought and waiting to be handed over (docs/dev/02 §2.25.9), and one kept from the member
 * it is for (§2.25.10). The suite shares one database, so the person is the run's own, and Nina's
 * claim to be them is given back before the case ends.
 */

/** Six letters no other attempt shares. */
function runLetters(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) =>
		String.fromCharCode(97 + (byte % 26))
	).join('');
}

const giftsCard = (page: Page) => page.locator('#section-gifts');

/** A second browser signed in as the household's other member, Nina. */
async function signInAsNina(browser: Browser): Promise<Page> {
	const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
	const page = await context.newPage();
	await page.goto('/login');
	await page.getByLabel('Email').fill(DEMO_MEMBER_EMAIL);
	await page.getByLabel('Password').fill(DEMO_ADMIN_PASSWORD);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'What happened?' })).toBeVisible();
	await appReady(page);
	return page;
}

/** Says, in Settings, that this is the person the signed-in member is. */
async function sayIAm(page: Page, name: string): Promise<void> {
	await page.goto('/settings');
	await pickPerson(page.getByLabel('Which of these people is you'), name);
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Saved.')).toBeVisible();
}

/** The person's row in Home's *Coming up*. */
async function comingUpRow(page: Page, name: string) {
	await page.goto('/');
	await appReady(page);
	return page.getByTestId('coming-up').locator('li', { hasText: name });
}

test('a surprise stays away from the member it is for, and a bought one waits as ready', async ({
	page,
	browser
}, testInfo) => {
	// The page's clock is under the test's hand: only `runFor` ends the undo window.
	await page.clock.install();
	await signIn(page);
	const today = await serverToday(page);
	// Tomorrow, so a run over midnight keeps the birthday near (docs/dev/08 §8.4.2).
	const birthday = isoDaysAfter(today, 1);
	const letters = runLetters();
	const name = `Hiltrud Schenk${letters}`;
	const book = `Book ${letters}`;
	const scarf = `Scarf ${letters}`;
	await seedHousehold(
		page,
		[name],
		[],
		{},
		[],
		[],
		[],
		{ [name]: `1960${birthday.slice(4)}` },
		{},
		{},
		{
			[name]: [{ title: book }]
		}
	);

	const nina = await signInAsNina(browser);
	try {
		await sayIAm(nina, name);

		// Noted for everyone but her.
		await page.goto(`/contacts/${personIdOf(name)}`);
		await appReady(page);
		const card = giftsCard(page);
		await card.getByRole('button', { name: 'Idea', exact: true }).click();
		const form = card.getByTestId('gift-form');
		await form.getByLabel('What?').fill(scarf);
		await form.getByText(`Everyone but ${name}`, { exact: true }).click();
		await form.getByRole('button', { name: 'Save' }).click();
		const scarfRow = card.getByTestId('gift-ideas').locator('li', { hasText: scarf });
		await expect(scarfRow.getByTestId('gift-surprise')).toHaveText(`hidden from ${name}`);
		await expect(card.getByRole('tab', { name: 'Ideas' })).toHaveText('Ideas · 2');
		await expect((await comingUpRow(page, name)).getByTestId('coming-up-gift-ideas')).toHaveText(
			'2 ideas'
		);

		// Nina sees the book and nothing of the scarf: not on her page, the list, Home or search.
		await nina.goto(`/contacts/${personIdOf(name)}`);
		await appReady(nina);
		await expect(giftsCard(nina).getByTestId('gift-ideas')).toContainText(book);
		await expect(giftsCard(nina)).not.toContainText(scarf);
		await expect(giftsCard(nina).getByRole('tab', { name: 'Ideas' })).toHaveText('Ideas · 1');
		await giftsCard(nina).screenshot({ path: testInfo.outputPath('recipient-card.png') });
		await nina.goto('/gifts');
		await appReady(nina);
		await expect(nina.getByText(book)).toBeVisible();
		await expect(nina.getByText(scarf)).toHaveCount(0);
		await expect((await comingUpRow(nina, name)).getByTestId('coming-up-gift-ideas')).toHaveText(
			'1 idea'
		);
		// The run's letters name both gifts: the book is found, the scarf is not.
		await nina.goto(`/search?q=${letters}`);
		await expect(nina.getByRole('heading', { name: 'Search', exact: true })).toBeVisible();
		const giftHits = nina.locator('section', {
			has: nina.getByRole('heading', { name: /^Gifts \d+$/ })
		});
		await expect(giftHits.getByRole('link', { name: new RegExp(book) })).toHaveCount(1);
		await expect(giftHits.getByRole('link', { name: new RegExp(scarf) })).toHaveCount(0);

		// Bought, taken back inside the window, bought again and left: ready, off the counts.
		await page.goto(`/contacts/${personIdOf(name)}`);
		await appReady(page);
		await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
		const toast = page.getByTestId('toast-undo');
		await scarfRow.getByTestId('gift-bought').click();
		await expect(scarfRow).toHaveCount(0);
		await expect(toast).toContainText(`“${scarf}” bought`);
		await toast.getByRole('button', { name: 'Undo' }).click();
		await expect(scarfRow).toHaveCount(1);
		await scarfRow.getByTestId('gift-bought').click();
		await expect(scarfRow).toHaveCount(0);
		const committed = page.waitForResponse(
			(response) =>
				response.request().method() === 'POST' && response.url().includes('markGiftBought')
		);
		await page.clock.runFor(UNDO_WINDOW_MS + 1);
		await committed;
		await page.clock.resume();
		const ready = card.getByTestId('gift-ready').locator('li', { hasText: scarf });
		await expect(ready).toHaveCount(1);
		await expect(card.getByTestId('gift-ready-heading')).toHaveText('Ready to give · 1');
		await expect(card.getByRole('tab', { name: 'Ideas' })).toHaveText('Ideas · 1');
		await expect(ready.getByTestId('gift-not-bought')).toBeVisible();
		await card.screenshot({ path: testInfo.outputPath('giver-card.png') });

		const giverHome = await comingUpRow(page, name);
		await expect(giverHome.getByTestId('coming-up-ready')).toHaveText(`Ready: ${scarf}`);
		await expect(giverHome.getByTestId('coming-up-gift-ideas')).toHaveText('1 idea');
		await page.getByTestId('coming-up').screenshot({ path: testInfo.outputPath('home-ready.png') });
		await page.goto('/gifts');
		await appReady(page);
		await expect(page.getByText(book)).toBeVisible();
		await expect(page.getByText(scarf)).toHaveCount(0);

		// Nina's Home has nothing ready for her.
		await expect((await comingUpRow(nina, name)).getByTestId('coming-up-ready')).toHaveCount(0);
	} finally {
		await releaseSelfClaim(nina);
		await nina.context().close();
	}
});

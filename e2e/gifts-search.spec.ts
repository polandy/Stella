import { expect, test, type Browser, type Page } from '@playwright/test';
import { addPerson, appReady, signIn } from './app';
import { DEMO_ADMIN_PASSWORD, DEMO_MEMBER_EMAIL } from '../src/lib/server/db/demo-seed';

/*
 * Gifts in the full search (docs/02 §2.9, §2.25.5): found on the search page by their title or
 * their note — not their link — in a group of their own, each hit naming the person and where
 * the gift stands and leading to that person's Gifts card; a private gift only for whoever
 * noted it. Written after the owner tried it in the app (docs/08 §8.4.1).
 *
 * The suite shares one database, so each case works on a person of its own and names its gifts
 * with letters no other attempt shares — the searched word is those letters alone.
 */

/** Six letters no other attempt shares. */
function runLetters(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) =>
		String.fromCharCode(97 + (byte % 26))
	).join('');
}

const giftsCard = (page: Page) => page.locator('#section-gifts');
const giftHits = (page: Page) =>
	page.locator('section', { has: page.getByRole('heading', { name: 'Gifts', exact: true }) });

/** Notes an idea through the card's own *+ Idea*, with a note, link or privacy when given. */
async function addIdea(
	page: Page,
	title: string,
	opts: { note?: string; link?: string; visibility?: 'private' } = {}
): Promise<void> {
	const card = giftsCard(page);
	await card.getByRole('button', { name: 'Idea', exact: true }).click();
	const form = card.getByTestId('gift-form');
	await form.getByLabel('What?').fill(title);
	if (opts.note !== undefined || opts.link !== undefined) {
		await form.getByRole('button', { name: 'Note or link' }).click();
		if (opts.note !== undefined) await form.getByLabel('Note').fill(opts.note);
		if (opts.link !== undefined) await form.getByLabel('Link').fill(opts.link);
	}
	if (opts.visibility === 'private') await form.getByText('Private', { exact: true }).click();
	await form.getByRole('button', { name: 'Save' }).click();
	await expect(card.getByTestId('gift-ideas')).toContainText(title);
}

async function searchFor(page: Page, query: string): Promise<void> {
	await page.goto(`/search?q=${encodeURIComponent(query)}`);
	await expect(page.getByRole('heading', { name: 'Search', exact: true })).toBeVisible();
}

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

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('a gift is found by its title and its note, and leads to the Gifts card', async ({ page }) => {
	const letters = runLetters();
	await addPerson(page, 'Eulalia', `Quarles${letters}`);
	const person = `Eulalia Quarles${letters}`;
	await addIdea(page, `Fotobuch ${letters}`, {
		note: `vom Zeltlager${letters}`,
		link: `https://shop.example/teekanne${letters}`
	});

	await searchFor(page, letters);
	const hit = giftHits(page).getByRole('link', { name: new RegExp(`Fotobuch ${letters}`) });
	await expect(hit).toHaveCount(1);
	await expect(hit).toContainText(`for ${person} · Idea`);

	// The note finds it too; the link, a shop's address, does not.
	await searchFor(page, `zeltlager${letters}`);
	await expect(giftHits(page)).toContainText(`Fotobuch ${letters}`);
	await searchFor(page, `teekanne${letters}`);
	await expect(page.getByText(`No results for “teekanne${letters}”.`)).toBeVisible();

	await searchFor(page, letters);
	await hit.click();
	await expect(page).toHaveURL(/#section-gifts$/);
	await expect(giftsCard(page).getByTestId('gift-ideas')).toContainText(`Fotobuch ${letters}`);
});

test('a private gift is found only by the member who noted it', async ({ page, browser }) => {
	const letters = runLetters();
	await addPerson(page, 'Eulalia', `Ormsby${letters}`);
	await addIdea(page, `Shared ${letters}`);
	await addIdea(page, `Secret ${letters}`, { visibility: 'private' });

	await searchFor(page, letters);
	await expect(giftHits(page).getByRole('link')).toHaveCount(2);

	const nina = await signInAsNina(browser);
	await searchFor(nina, letters);
	// Positive control: Nina's search does find the shared one.
	await expect(giftHits(nina).getByRole('link')).toHaveCount(1);
	await expect(giftHits(nina)).toContainText(`Shared ${letters}`);
	await expect(giftHits(nina)).not.toContainText(`Secret ${letters}`);
	await nina.context().close();
});

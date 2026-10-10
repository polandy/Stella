import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { addPerson, appReady, openPeople, signIn } from './app';
import { DEMO_ADMIN_PASSWORD, DEMO_MEMBER_EMAIL } from '../src/lib/server/db/demo-seed';

/*
 * The Gifts card on the person page (docs/02 §2.25): ideas noted the moment they come, marked
 * as given with an occasion, gifts received, and the story that shows what changed hands.
 * Written after the owner tried the card in the app (docs/08 §8.4.1).
 *
 * The suite shares one database, so every case works on a person of its own, added under a
 * first name no demo household and no other spec uses — a picker or search elsewhere must
 * never find it — and gifts named with the same letters.
 */

/** Six letters no other attempt shares. */
function runLetters(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) =>
		String.fromCharCode(97 + (byte % 26))
	).join('');
}

/** A new person with nothing on their page yet; returns the letters that name their gifts. */
async function addGiftlessPerson(page: Page): Promise<string> {
	const letters = runLetters();
	await addPerson(page, 'Pimpernell', `Fenwick${letters}`);
	return letters;
}

const giftsCard = (page: Page) => page.locator('#section-gifts');
const ideaRow = (page: Page, title: string) =>
	page.getByTestId('gift-ideas').locator('li', { hasText: title });

/** Notes an idea through the card's own *+ Idea*, with a link when one is given. */
async function addIdea(
	page: Page,
	title: string,
	opts: { link?: string; visibility?: 'private' } = {}
): Promise<Locator> {
	const card = giftsCard(page);
	await card.getByRole('button', { name: 'Idea', exact: true }).click();
	const form = card.getByTestId('gift-form');
	await form.getByLabel('What?').fill(title);
	if (opts.link !== undefined) {
		await form.getByRole('button', { name: 'Note or link' }).click();
		await form.getByLabel('Link').fill(opts.link);
	}
	if (opts.visibility === 'private') await form.getByText('Private', { exact: true }).click();
	await form.getByRole('button', { name: 'Save' }).click();
	return form;
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

test('an idea says when it was noted, and its link is a web address', async ({ page }) => {
	const letters = await addGiftlessPerson(page);
	const card = giftsCard(page);
	await expect(card).toHaveAttribute('data-empty-line', 'true');
	await expect(card.locator('header').getByText('No gift ideas yet.')).toBeVisible();

	const teapot = `Teapot ${letters}`;
	await addIdea(page, teapot, { link: 'shop.example/x' });

	const row = ideaRow(page, teapot);
	await expect(row).toHaveCount(1);
	await expect(card).not.toHaveAttribute('data-empty-line');
	await expect(card.getByRole('tab', { name: 'Ideas · 1' })).toBeVisible();
	// The day it was noted, worded like every day on the page — the format, not today's date.
	await expect(row.getByTestId('gift-added')).toHaveText(/^Added \d{1,2} [A-Z][a-z]+ \d{4}$/);
	await expect(row).toContainText('noted by you');
	// A bare address is taken as a web address.
	await expect(row.getByRole('link', { name: `Open the link for “${teapot}”` })).toHaveAttribute(
		'href',
		'https://shop.example/x'
	);

	// Anything but a web address is refused, and nothing is noted.
	const trick = `Trick ${letters}`;
	const form = await addIdea(page, trick, { link: 'javascript:alert(1)' });
	await expect(card.getByText('The link must be a web address.')).toBeVisible();
	await expect(form.getByLabel('What?')).toHaveValue(trick);
	await expect(ideaRow(page, teapot)).toHaveCount(1);
	await expect(ideaRow(page, trick)).toHaveCount(0);
});

test('an idea marked as given moves to Given and shows in the story', async ({ page }) => {
	const letters = await addGiftlessPerson(page);
	const card = giftsCard(page);
	const scarf = `Scarf ${letters}`;
	await addIdea(page, scarf);
	const row = ideaRow(page, scarf);
	await expect(row).toHaveCount(1);

	await row.getByRole('button', { name: 'Mark as given…' }).click();
	const give = row.getByTestId('mark-given');
	await expect(give).toContainText(`“${scarf}” given`);
	await give.getByText('Birthday', { exact: true }).click();
	await give.getByRole('button', { name: 'Mark as given', exact: true }).click();

	// The card follows the gift to its new tab, where it carries its day and occasion.
	await expect(card.getByRole('tab', { name: /^Given/, selected: true })).toBeVisible();
	const given = card.getByTestId('gift-year').locator('li', { hasText: scarf });
	await expect(given).toContainText('Birthday');
	await expect(given.getByTestId('gift-added')).toHaveCount(0);
	await expect(card.getByRole('tab', { name: /^Ideas/ })).toHaveText('Ideas');

	const story = page.locator('#section-story [data-story-item]', { hasText: scarf });
	await expect(story).toHaveCount(1);
	await expect(story).toContainText('Birthday');
});

test('a removed gift comes back with Undo', async ({ page }) => {
	const letters = await addGiftlessPerson(page);
	const book = `Book ${letters}`;
	await addIdea(page, book);
	const row = ideaRow(page, book);
	await expect(row).toHaveCount(1);

	await row.getByRole('button', { name: `Remove “${book}”` }).click();
	const toast = page.getByTestId('toast-undo');
	await expect(toast).toContainText('Gift removed');
	await expect(row).toHaveCount(0);

	await toast.getByRole('button', { name: 'Undo' }).click();
	await expect(toast).toHaveCount(0);
	await expect(row).toHaveCount(1);
	await page.reload();
	await expect(ideaRow(page, book)).toHaveCount(1);
});

test('a gift already removed in another tab counts as removed', async ({ page, context }) => {
	const letters = await addGiftlessPerson(page);
	const book = `Book ${letters}`;
	await addIdea(page, book);
	await expect(ideaRow(page, book)).toHaveCount(1);
	const personPage = page.url();

	// A second tab still lists it.
	const other = await context.newPage();
	await other.goto(personPage);
	await appReady(other);
	await expect(ideaRow(other, book)).toHaveCount(1);

	// The first tab removes it for real: leaving through the app commits the removal first.
	await ideaRow(page, book)
		.getByRole('button', { name: `Remove “${book}”` })
		.click();
	await expect(page.getByTestId('toast-undo')).toBeVisible();
	await openPeople(page);

	// The second tab's removal finds nothing left: what it asked for is done, so nothing failed.
	// The layout holds the navigation until the removal is sent and answered, so a notice
	// would be up by the time the address changes — the heading is no proof, as the person
	// page has a People card of its own.
	await ideaRow(other, book)
		.getByRole('button', { name: `Remove “${book}”` })
		.click();
	await expect(other.getByTestId('toast-undo')).toBeVisible();
	await other.getByRole('link', { name: 'People' }).first().click();
	await expect(other).not.toHaveURL(personPage);
	await expect(other.getByTestId('toast-notice')).toHaveCount(0);

	// Gone for real, in both.
	await other.goto(personPage);
	await appReady(other);
	await expect(ideaRow(other, book)).toHaveCount(0);
});

test('a gift received opens the Received tab', async ({ page }) => {
	const letters = await addGiftlessPerson(page);
	const card = giftsCard(page);
	const jam = `Jam ${letters}`;
	await addIdea(page, `Candle ${letters}`);
	await expect(card.getByRole('tab', { name: 'Ideas · 1' })).toBeVisible();
	await expect(card.getByRole('tab', { name: /^Received/ })).toHaveCount(0);

	await card.getByRole('button', { name: 'More for gifts' }).click();
	await page.getByRole('menuitem', { name: 'Received' }).click();
	const form = card.getByTestId('gift-form');
	await expect(form).toContainText('Received from Pimpernell');
	await form.getByLabel('What?').fill(jam);
	await form.getByRole('button', { name: 'Save' }).click();

	await expect(card.getByRole('tab', { name: /^Received/, selected: true })).toBeVisible();
	await expect(card.getByTestId('gift-year').locator('li', { hasText: jam })).toHaveCount(1);
});

test('a private gift stays with the member who noted it', async ({ page, browser }) => {
	const letters = await addGiftlessPerson(page);
	const shared = `Gloves ${letters}`;
	const secret = `Watch ${letters}`;
	await addIdea(page, shared);
	await expect(ideaRow(page, shared)).toHaveCount(1);
	await addIdea(page, secret, { visibility: 'private' });
	await expect(ideaRow(page, secret)).toContainText('private');

	const nina = await signInAsNina(browser);
	await nina.goto(page.url());
	await appReady(nina);
	await expect(ideaRow(nina, shared)).toHaveCount(1);
	await expect(ideaRow(nina, shared)).toContainText('noted by');
	await expect(ideaRow(nina, secret)).toHaveCount(0);
	await nina.context().close();
});

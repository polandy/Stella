import { expect, test, type Browser, type Page } from '@playwright/test';
import { DEMO_ADMIN_PASSWORD, DEMO_MEMBER_EMAIL } from '../src/lib/server/db/demo-constants';
import { appReady, signIn } from './app';
import { stateOf } from './graph-canvas';
import { LINK, personIdOf, seedHousehold } from './seed';

/*
 * A private person across members (docs/dev/02 §2.10): the member who made them sees them; the
 * household's other member, Nina, finds no trace in People, search, the map, the stream or a
 * shared relative's relationships. Every case reads the same page as the author first, so a
 * missing trace is a hidden one, not an unrendered one.
 * The shared → private warning is not covered: nothing in the app turns a contact private yet.
 */

/** Letters no other attempt shares: a seed is add-only by id, so each test seeds its own pair. */
function runLetters(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) =>
		String.fromCharCode(97 + (byte % 26))
	).join('');
}

interface Pair {
	letters: string;
	shared: string;
	secret: string;
}

/** A shared person and a private one, friends, made by the signed-in account. */
async function seedPair(page: Page): Promise<Pair> {
	const letters = runLetters();
	const shared = `Gundula Pfeiffer${letters}`;
	const secret = `Isidor Nebelung${letters}`;
	await seedHousehold(
		page,
		[shared, secret],
		[{ from: shared, to: secret, type: LINK.friendOf }],
		{},
		[],
		[],
		[],
		{},
		{},
		{},
		{},
		{},
		[secret]
	);
	return { letters, shared, secret };
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

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

const main = (page: Page) => page.getByRole('main');

test('People lists the private person for the author only', async ({ page, browser }) => {
	const { shared: SHARED, secret: SECRET } = await seedPair(page);
	await page.goto('/contacts');
	await expect(main(page).getByRole('link', { name: SECRET })).toBeVisible();

	const nina = await signInAsNina(browser);
	await nina.goto('/contacts');
	await expect(main(nina).getByRole('link', { name: SHARED })).toBeVisible();
	await expect(main(nina).getByRole('link', { name: SECRET })).toHaveCount(0);
	await nina.context().close();
});

test('the search finds the private person for the author only', async ({ page, browser }) => {
	const { letters, shared: SHARED, secret: SECRET } = await seedPair(page);
	await page.goto(`/search?q=Nebelung${letters}`);
	await expect(main(page).getByRole('link', { name: SECRET }).first()).toBeVisible();

	const nina = await signInAsNina(browser);
	await nina.goto(`/search?q=Nebelung${letters}`);
	await expect(nina.getByRole('heading', { name: 'Search', exact: true })).toBeVisible();
	await expect(main(nina).getByRole('link', { name: SECRET })).toHaveCount(0);
	await nina.goto(`/search?q=Pfeiffer${letters}`);
	await expect(main(nina).getByRole('link', { name: SHARED }).first()).toBeVisible();
	await nina.context().close();
});

test('the map draws the private person for the author only', async ({ page, browser }) => {
	const { shared: SHARED, secret: SECRET } = await seedPair(page);
	await page.goto(`/graph?center=${personIdOf(SHARED)}`);
	await expect(page.locator('canvas').first()).toBeVisible();
	await expect.poll(() => stateOf(page, personIdOf(SECRET))).toBe('drawn');

	const nina = await signInAsNina(browser);
	await nina.goto(`/graph?center=${personIdOf(SHARED)}`);
	await expect(nina.locator('canvas').first()).toBeVisible();
	await expect.poll(() => stateOf(nina, personIdOf(SHARED))).toBe('drawn');
	await expect.poll(() => stateOf(nina, personIdOf(SECRET))).toBe('absent');
	await nina.context().close();
});

test('the stream says "added" about the private person to the author only', async ({
	page,
	browser
}) => {
	const { shared: SHARED, secret: SECRET } = await seedPair(page);
	const added = (p: Page, name: string) => main(p).getByRole('link', { name, exact: true });
	await page.goto('/');
	await expect(added(page, SHARED).first()).toBeVisible();
	await expect(added(page, SECRET).first()).toBeVisible();

	const nina = await signInAsNina(browser);
	await expect(added(nina, SHARED).first()).toBeVisible();
	await expect(added(nina, SECRET)).toHaveCount(0);
	await nina.context().close();
});

test('a shared relative lists the private person for the author only, and their page is gone for Nina', async ({
	page,
	browser
}) => {
	const { shared: SHARED, secret: SECRET } = await seedPair(page);
	const card = (p: Page) => p.locator('#section-relationships');
	await page.goto(`/contacts/${personIdOf(SHARED)}`);
	await expect(card(page).getByRole('link', { name: SECRET })).toBeVisible();

	const nina = await signInAsNina(browser);
	await nina.goto(`/contacts/${personIdOf(SHARED)}`);
	await expect(nina.getByRole('heading', { level: 1, name: SHARED })).toBeVisible();
	await expect(card(nina)).toBeVisible();
	await expect(card(nina).getByRole('link', { name: SECRET })).toHaveCount(0);

	const response = await nina.goto(`/contacts/${personIdOf(SECRET)}`);
	expect(response?.status()).toBe(404);
	await nina.context().close();
});

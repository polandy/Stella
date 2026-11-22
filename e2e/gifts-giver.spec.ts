import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { appReady, signIn } from './app';
import { LINK, personIdOf, seedHousehold } from './seed';
import { DEMO_ADMIN_PASSWORD, DEMO_MEMBER_EMAIL } from '../src/lib/server/db/demo-constants';

/*
 * Who gives a gift (docs/dev/02 §2.25.12): *Assign…* gives an idea to one of the person's links,
 * to the household, and frees it again; *+ Given* asks whom it was from. A giver out of a member's
 * view reads *taken*, naming nobody (docs/dev/03 §3.7). The person is the run's own, since the
 * suite shares one database.
 */

/** Six letters no other attempt shares. */
function runLetters(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) =>
		String.fromCharCode(97 + (byte % 26))
	).join('');
}

const giftsCard = (page: Page) => page.locator('#section-gifts');
/** Finds a giver in the search and adds them; the first match is the one a suggestion puts first. */
async function pickGiver(scope: Locator, name: string): Promise<void> {
	const field = scope.getByTestId('gift-giver');
	await field.getByRole('combobox').fill(name);
	await field.getByRole('option').filter({ hasText: name }).first().click();
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

/** Gives the idea on the open person page to one of the suggested givers. */
async function assignTo(page: Page, idea: string, giver: string): Promise<void> {
	const row = giftsCard(page).getByTestId('gift-ideas').locator('li', { hasText: idea });
	await row.getByTestId('gift-assign-open').click();
	const assign = row.getByTestId('gift-assign');
	await pickGiver(assign, giver);
	await assign.getByRole('button', { name: 'Assign', exact: true }).click();
	await expect(row.getByTestId('gift-giver-line')).toHaveText(`${giver} is giving it`);
}

test('an idea is given to a person, to the household, freed, and a gift given says whom from', async ({
	page
}) => {
	await signIn(page);
	const letters = runLetters();
	const name = `Korbinian Geber${letters}`;
	const aunt = `Gernot Geber${letters}`;
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

	// To a link of theirs, suggested with what they are to each other.
	await row.getByTestId('gift-assign-open').click();
	const assign = row.getByTestId('gift-assign');
	await pickGiver(assign, aunt);
	await assign.getByRole('button', { name: 'Assign', exact: true }).click();
	await expect(row.getByTestId('gift-giver-line')).toHaveText(`${aunt} is giving it`);

	// Moved on to the household, saying whom it replaces.
	await row.getByRole('button', { name: 'Change giver' }).click();
	await assign.getByRole('button', { name: `Remove ${aunt}` }).click();
	await pickGiver(assign, 'Us');
	await expect(assign.getByTestId('gift-assign-replaces')).toContainText(aunt);
	await assign.getByRole('button', { name: 'Assign', exact: true }).click();
	await expect(row.getByTestId('gift-giver-line')).toHaveText('We are giving it');

	// Free again.
	await row.getByRole('button', { name: 'Change giver' }).click();
	await assign.getByTestId('gift-assign-free').click();
	await expect(row.getByTestId('gift-giver-line')).toHaveCount(0);
	await expect(row.getByTestId('gift-assign-open')).toHaveText('Assign…');

	// A gift given earlier, from that link.
	await card.getByRole('button', { name: 'Given', exact: true }).click();
	const form = card.getByTestId('gift-form');
	await form.getByLabel('What?').fill(kite);
	await pickGiver(form, aunt);
	await form.getByRole('button', { name: 'Save' }).click();
	await expect(card.locator('li', { hasText: kite }).getByTestId('gift-giver-line')).toHaveText(
		`from ${aunt}`
	);
});

test('a giver the other member may not see reads as taken, one they may see by name', async ({
	page,
	browser
}) => {
	await signIn(page);
	const letters = runLetters();
	const name = `Hartmut Sicht${letters}`;
	const secret = `Ortrud Sicht${letters}`;
	const shared = `Eberhard Sicht${letters}`;
	const puzzle = `Puzzle ${letters}`;
	const kite = `Kite ${letters}`;
	await seedHousehold(
		page,
		[name, secret, shared],
		[
			{ from: name, to: secret, type: LINK.siblingOf },
			{ from: name, to: shared, type: LINK.siblingOf }
		],
		{},
		[],
		[],
		[],
		{},
		{},
		{},
		{ [name]: [{ title: puzzle }, { title: kite }] },
		{},
		[secret]
	);
	await page.goto(`/contacts/${personIdOf(name)}`);
	await appReady(page);
	await assignTo(page, puzzle, secret);
	await assignTo(page, kite, shared);

	const nina = await signInAsNina(browser);
	await nina.goto(`/contacts/${personIdOf(name)}`);
	await appReady(nina);
	const ideas = giftsCard(nina).getByTestId('gift-ideas');
	await expect(ideas.locator('li', { hasText: kite }).getByTestId('gift-giver-line')).toHaveText(
		`${shared} is giving it`
	);
	await expect(ideas.locator('li', { hasText: puzzle }).getByTestId('gift-giver-line')).toHaveText(
		'taken'
	);
	await expect(nina.getByText(secret)).toHaveCount(0);
	await nina.context().close();
});

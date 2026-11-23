import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { appReady, signIn } from './app';
import { LINK, personIdOf, seedHousehold } from './seed';
import { DEMO_ADMIN_PASSWORD, DEMO_MEMBER_EMAIL } from '../src/lib/server/db/demo-constants';

/*
 * Several people give one gift (docs/dev/02 §2.25.12): *+ Given* names them as chips in a quiet
 * *Von* line, the row reads *from A and B* with each name a link, the other giver's *Gives* tab
 * lists the gift *together with* the first, and a giver the other member may not see reads
 * *someone else* beside one they may see by name (docs/dev/03 §3.7).
 */

function runLetters(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) =>
		String.fromCharCode(97 + (byte % 26))
	).join('');
}

const giftsCard = (page: Page) => page.locator('#section-gifts');

/** Opens *Von* if it is the quiet line, finds a giver in the search and adds them. */
async function addGiver(field: Locator, name: string): Promise<void> {
	const change = field.getByTestId('gift-giver-change');
	if ((await field.getByRole('combobox').isHidden()) && (await change.isVisible())) {
		await change.click();
	}
	await field.getByRole('combobox').fill(name);
	await field.getByRole('option').filter({ hasText: name }).first().click();
}

async function signInAsNina(browser: Browser): Promise<Page> {
	const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
	const page = await context.newPage();
	await page.goto('/login');
	await page.getByLabel('Email').fill(DEMO_MEMBER_EMAIL);
	await page.getByLabel('Password').fill(DEMO_ADMIN_PASSWORD);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'What happened?' })).toBeVisible();
	return page;
}

test('Von is a quiet line, two givers share a gift, and a giver out of view reads someone else', async ({
	page,
	browser
}) => {
	await signIn(page);
	const letters = runLetters();
	const name = `Cornelius Mehr${letters}`;
	const aunt = `Gertrud Mehr${letters}`;
	const uncle = `Hubert Mehr${letters}`;
	const secret = `Ortrud Mehr${letters}`;
	const teapot = `Teapot ${letters}`;
	const kite = `Kite ${letters}`;
	await seedHousehold(
		page,
		[name, aunt, uncle, secret],
		[
			{ from: name, to: aunt, type: LINK.siblingOf },
			{ from: name, to: uncle, type: LINK.siblingOf },
			{ from: name, to: secret, type: LINK.siblingOf }
		],
		{},
		[],
		[],
		[],
		{},
		{},
		{},
		{ [name]: [{ title: `Idea ${letters}` }] },
		{},
		[secret]
	);
	await page.goto(`/contacts/${personIdOf(name)}`);
	await appReady(page);
	const card = giftsCard(page);

	// Von is one quiet line saying us, and a gift saved with it names nobody.
	await card.getByRole('button', { name: 'Given', exact: true }).click();
	const form = card.getByTestId('gift-form');
	await form.getByLabel('What?').fill(kite);
	await expect(form.getByTestId('gift-giver-from')).toContainText('From us');
	await expect(form.getByTestId('gift-giver').getByRole('combobox')).toBeHidden();
	await form.getByRole('button', { name: 'Save' }).click();
	await expect(card.locator('li', { hasText: kite })).toBeVisible();
	await expect(card.locator('li', { hasText: kite }).getByTestId('gift-giver-line')).toHaveCount(0);

	// Two people give the teapot together.
	await card.getByRole('button', { name: 'Given', exact: true }).click();
	await form.getByLabel('What?').fill(teapot);
	const field = form.getByTestId('gift-giver');
	await addGiver(field, aunt);
	await addGiver(field, uncle);
	await expect(form.getByTestId('gift-giver-from')).toContainText(`From ${aunt}, ${uncle}`);
	await form.getByRole('button', { name: 'Save' }).click();
	const line = card.locator('li', { hasText: teapot }).getByTestId('gift-giver-line');
	await expect(line).toHaveText(`from ${aunt} and ${uncle}`);
	await expect(line.getByRole('link', { name: aunt })).toHaveAttribute(
		'href',
		`/contacts/${personIdOf(aunt)}`
	);

	// The aunt's own page lists it under Gives, together with the uncle, who is a link too.
	await line.getByRole('link', { name: aunt }).click();
	await appReady(page);
	const auntCard = giftsCard(page);
	await auntCard.getByRole('tab', { name: /^Gives/ }).click();
	const gives = auntCard.getByTestId('gift-gives-row').filter({ hasText: teapot });
	await expect(gives.getByTestId('gift-gives-together')).toHaveText(`together with ${uncle}`);
	await expect(
		gives.getByTestId('gift-gives-together').getByRole('link', { name: uncle })
	).toBeVisible();

	// A giver out of Nina's view is someone else beside the one she may see.
	await page.goto(`/contacts/${personIdOf(name)}`);
	await appReady(page);
	await card.getByRole('button', { name: 'Given', exact: true }).click();
	await form.getByLabel('What?').fill(`Scarf ${letters}`);
	await addGiver(field, aunt);
	await addGiver(field, secret);
	await form.getByRole('button', { name: 'Save' }).click();
	await expect(card.locator('li', { hasText: `Scarf ${letters}` })).toBeVisible();

	const nina = await signInAsNina(browser);
	await nina.goto(`/contacts/${personIdOf(name)}`);
	await appReady(nina);
	await giftsCard(nina)
		.getByRole('tab', { name: /^Given/ })
		.click();
	await expect(
		giftsCard(nina)
			.locator('li', { hasText: `Scarf ${letters}` })
			.getByTestId('gift-giver-line')
	).toHaveText(`from ${aunt} and someone else`);
	await expect(nina.getByText(secret)).toHaveCount(0);
	await nina.context().close();
});

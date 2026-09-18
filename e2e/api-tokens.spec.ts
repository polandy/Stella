import { expect, test, type Page } from '@playwright/test';
import { signIn } from './app';

/*
 * API tokens and the import API (docs/02 §2.16.1), end to end: a token is made on its settings
 * page, shown once, signs the API in, and stops the moment it is revoked; and what a script
 * sends through it lands in the household as a person with a page and a circle. Written after
 * the flow was verified in the running app (docs/08 §8.4.1).
 *
 * Every refusal is paired with the same thing succeeding first — the token answering before it
 * is revoked, the page being signed in while its cookie is refused by the API — so no case can
 * pass because nothing works at all.
 *
 * The suite shares one demo database: the Okafors are in no seed and no other spec, and each
 * case names its token after itself so the two cannot find each other's rows.
 */

const UNAUTHORIZED = 401;
const OK = 200;

/** Makes a token on the settings page and returns the secret it shows. */
async function createToken(page: Page, name: string): Promise<string> {
	await page.goto('/settings');
	await page.getByRole('link', { name: /API tokens/ }).click();
	await page.getByLabel('What is it for?').fill(name);
	await page.getByRole('button', { name: 'Create token' }).click();
	const token = (await page.getByTestId('new-token').locator('code').first().textContent()) ?? '';
	expect(token).toMatch(/^stella_[0-9a-f]{48}$/);
	return token;
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

test('a token is shown once, signs the API in, and stops the moment it is revoked', async ({
	page
}) => {
	await signIn(page);
	const name = 'Okafor revoke check';
	const token = await createToken(page, name);
	const row = page.getByTestId('api-tokens').getByRole('listitem').filter({ hasText: name });
	await expect(row).toContainText('never used');

	expect((await page.request.get('/api/v1/circles', { headers: bearer(token) })).status()).toBe(OK);
	// The page is signed in by its cookie; the API still refuses a request carrying only that.
	expect((await page.request.get('/api/v1/circles')).status()).toBe(UNAUTHORIZED);

	await page.reload();
	await expect(row).toContainText('last used');
	await expect(page.getByTestId('new-token')).toHaveCount(0);

	await page.getByRole('button', { name: `Revoke “${name}”` }).click();
	await expect(page.getByText('Token revoked.')).toBeVisible();
	await expect(row).toHaveCount(0);
	expect((await page.request.get('/api/v1/circles', { headers: bearer(token) })).status()).toBe(
		UNAUTHORIZED
	);
});

test('people sent through the import API get a page and a circle', async ({ page }) => {
	await signIn(page);
	const token = await createToken(page, 'Okafor import check');
	const document = {
		source: 'e2e-okafor',
		people: [
			{ ref: 'zuri', firstName: 'Zuri', lastName: 'Okafor', birthDate: '2019-04-02' },
			{
				ref: 'ada',
				firstName: 'Ada',
				lastName: 'Okafor',
				fields: [{ kind: 'phone', value: '+41 79 555 01 02' }]
			}
		],
		relationships: [{ from: 'ada', to: 'zuri', type: 'parent_child' }],
		circles: [
			{
				ref: 'kg',
				name: 'Okafor Kindergarten',
				kind: 'class',
				members: [
					{ person: 'zuri', role: 'Child' },
					{ person: 'ada', role: 'Parent' }
				]
			}
		]
	};

	const dryRun = await page.request.post('/api/v1/import?dryRun=true', {
		headers: bearer(token),
		data: document
	});
	expect(await dryRun.json()).toMatchObject({ dryRun: true, added: { people: 2, circles: 1 } });

	const imported = await page.request.post('/api/v1/import', {
		headers: bearer(token),
		data: document
	});
	const answer = await imported.json();
	expect(answer).toMatchObject({
		dryRun: false,
		added: { people: 2, relationships: 1, memberships: 2 }
	});
	const zuri = answer.people.find((p: { ref: string }) => p.ref === 'zuri');

	await page.goto(`/contacts/${zuri.id}`);
	await expect(page.getByRole('heading', { name: 'Zuri Okafor' })).toBeVisible();
	await expect(page.getByText('Okafor Kindergarten').first()).toBeVisible();
	// The link, as the person page's own list of entered relationships reads it.
	await expect(
		page
			.locator('#section-relationships ul')
			.first()
			.locator('li')
			.filter({ hasText: 'Ada Okafor' })
	).toContainText('Child of');

	const again = await page.request.post('/api/v1/import', {
		headers: bearer(token),
		data: document
	});
	expect(await again.json()).toMatchObject({
		added: { people: 0, relationships: 0, circles: 0, memberships: 0 }
	});
});

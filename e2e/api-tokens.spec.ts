import { expect, test, type Page } from '@playwright/test';
import { signIn } from './app';

/*
 * API tokens and the import API (docs/02 §2.16.1), end to end: a token is made on its settings
 * page, shown once, signs the API in, and stops the moment it is revoked; and what a script
 * sends through it lands in the household as a person with a page and a circle, completes a
 * person already there with the details they lack, once, or renames and nests circles already
 * there. Written after the flow
 * was verified in the running app (docs/08 §8.4.1).
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
const UNPROCESSABLE = 422;

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
		page.getByTestId('relationship-list').locator('li').filter({ hasText: 'Ada Okafor' })
	).toContainText(/Parent|Mother|Father/);

	const again = await page.request.post('/api/v1/import', {
		headers: bearer(token),
		data: document
	});
	expect(await again.json()).toMatchObject({
		added: { people: 0, relationships: 0, circles: 0, memberships: 0 }
	});
});

test('the import API adds what a person already in Stella lacks, and only once', async ({
	page
}) => {
	await signIn(page);
	const token = await createToken(page, 'Okafor completion check');
	// Kemi enters the household first, from an earlier list, with only a phone number.
	const earlier = await page.request.post('/api/v1/import', {
		headers: bearer(token),
		data: {
			source: 'e2e-okafor-earlier',
			people: [
				{
					ref: 'kemi',
					firstName: 'Kemi',
					lastName: 'Okafor',
					fields: [{ kind: 'phone', value: '+41 79 555 03 04' }]
				}
			]
		}
	});
	const kemiId: string = (await earlier.json()).people[0].id;

	// A later list knows her too: the same phone, spelled differently, and an address.
	const address = 'Okaforweg 7, 3007 Bern';
	const document = {
		source: 'e2e-okafor-class-list',
		people: [
			{
				ref: 'kemi',
				existingId: kemiId,
				fields: [
					{ kind: 'phone', value: '+41  79 555 03 04 ' },
					{ kind: 'address', value: address }
				]
			}
		]
	};
	const kemiIn = (answer: { people: { ref: string }[] }) =>
		answer.people.find((p) => p.ref === 'kemi');

	const dryRun = await (
		await page.request.post('/api/v1/import?dryRun=true', {
			headers: bearer(token),
			data: document
		})
	).json();
	expect(dryRun).toMatchObject({ dryRun: true, added: { people: 0, fields: 1 } });
	expect(kemiIn(dryRun)).toMatchObject({ id: kemiId, status: 'existing', fieldsAdded: 1 });

	// The dry run wrote nothing: her page has no address yet.
	await page.goto(`/contacts/${kemiId}`);
	await expect(page.getByRole('heading', { name: 'Kemi Okafor' })).toBeVisible();
	await expect(page.getByText(address)).toHaveCount(0);

	const imported = await (
		await page.request.post('/api/v1/import', { headers: bearer(token), data: document })
	).json();
	expect(imported).toMatchObject({ dryRun: false, added: { people: 0, fields: 1 } });
	expect(kemiIn(imported)).toMatchObject({ fieldsAdded: 1 });

	await page.reload();
	await expect(page.getByText(address)).toBeVisible();
	await expect(page.getByText('+41 79 555 03 04')).toHaveCount(1);

	const again = await (
		await page.request.post('/api/v1/import', { headers: bearer(token), data: document })
	).json();
	expect(again).toMatchObject({ added: { fields: 0 }, alreadyThere: { fields: 2 } });
	expect(kemiIn(again)).toMatchObject({ fieldsAdded: 0 });
});

test('the import API renames circles already in Stella and nests them, never in a loop', async ({
	page
}) => {
	await signIn(page);
	const token = await createToken(page, 'Okafor circles check');
	const send = async (data: object, dryRun = false) =>
		page.request.post(`/api/v1/import${dryRun ? '?dryRun=true' : ''}`, {
			headers: bearer(token),
			data
		});
	// A class and a kindergarten year enter the household first, from earlier lists. No name
	// here contains `kl`: circles-browse.spec.ts counts what that query leaves.
	const earlier = await (
		await send({
			source: 'e2e-okafor-years',
			circles: [
				{ ref: 'class', name: 'Okafor Year One', kind: 'school' },
				{ ref: 'kg', name: 'Okafor Kindergarten 2023', kind: 'class' }
			]
		})
	).json();
	const idOf = (ref: string): string =>
		earlier.circles.find((c: { ref: string }) => c.ref === ref).id;
	const classId = idOf('class');

	// Later, one script puts the career in order: a school circle, both years inside it.
	const career = {
		source: 'e2e-okafor-career',
		circles: [
			{ ref: 'school', name: 'Okafor Schule', kind: 'school' },
			{
				ref: 'class',
				existingId: classId,
				name: 'Okafor Class 1-2D 26/27',
				kind: 'class',
				startDate: '2026-08-01',
				parent: 'school'
			},
			{ ref: 'kg', existingId: idOf('kg'), name: 'Okafor Kindergarten 23/24', parent: 'school' }
		]
	};
	const classIn = (answer: { circles: { ref: string }[] }) =>
		answer.circles.find((c) => c.ref === 'class');

	const dryRun = await (await send(career, true)).json();
	expect(dryRun).toMatchObject({ dryRun: true, added: { circles: 1 }, changed: { circles: 2 } });
	expect(classIn(dryRun)).toMatchObject({
		status: 'existing',
		name: 'Okafor Class 1-2D 26/27',
		changes: {
			name: { from: 'Okafor Year One', to: 'Okafor Class 1-2D 26/27' },
			kind: { from: 'school', to: 'class' },
			startDate: { from: null, to: '2026-08-01' },
			parent: { from: null, to: { name: 'Okafor Schule' } }
		}
	});

	// The dry run wrote nothing: the class keeps its old name.
	await page.goto(`/circles/${classId}`);
	await expect(page.getByRole('heading', { name: 'Okafor Year One', level: 1 })).toBeVisible();

	const imported = await (await send(career)).json();
	expect(imported).toMatchObject({ dryRun: false, added: { circles: 1 }, changed: { circles: 2 } });

	await page.reload();
	await expect(
		page.getByRole('heading', { name: 'Okafor Class 1-2D 26/27', level: 1 })
	).toBeVisible();

	expect(await (await send(career)).json()).toMatchObject({
		added: { circles: 0 },
		changed: { circles: 0 }
	});

	// The school cannot go inside the class that now sits inside it.
	const loop = await send({
		source: 'e2e-okafor-loop',
		circles: [
			{ ref: 'class', existingId: classId },
			{ ref: 'school', existingId: imported.circles[0].id, parent: 'class' }
		]
	});
	expect(loop.status()).toBe(UNPROCESSABLE);
	expect(await loop.json()).toEqual({
		problems: [{ code: 'circleCycle', path: 'circles[1].parent', ref: 'class' }]
	});
});

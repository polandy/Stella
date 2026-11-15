import { expect, test, type Page } from '@playwright/test';
import { appReady, fillDate, recordAction, serverToday, signIn } from './app';
import { LINK, personIdOf, seedHousehold } from './seed';

/*
 * An estimated birth year (docs/dev/02 §2.13.1): the page states it as an age that counts on by
 * itself, the brief beside the family's other ages, and a deceased person's as the year alone.
 * Behaviour the owner chose on 2026-11-15 (F1–F5): an age typed alone is the way in, and saving a
 * birthday with its year clears the estimate.
 *
 * The suite shares one database, so every case seeds people of its own, named with letters no
 * other attempt shares. The ages hang on the server's year, never on the runner's clock.
 */

/** Six letters no other attempt shares. */
function runLetters(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) =>
		String.fromCharCode(97 + (byte % 26))
	).join('');
}

const personPage = (page: Page, name: string) => page.goto(`/contacts/${personIdOf(name)}`);
const birthdayFact = (page: Page) => page.locator('[data-fact="birthday"]');

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('states an estimated birth year as an age, in the dates editor and the brief too, and only the year once they died', async ({
	page
}) => {
	const year = Number((await serverToday(page)).slice(0, 4));
	const last = `Schaetzwil${runLetters()}`;
	const lena = `Lena ${last}`;
	const ben = `Ben ${last}`;
	const opa = `Otto ${last}`;
	const baby = `Nino ${last}`;
	await seedHousehold(
		page,
		[lena, ben, opa, baby],
		[{ from: lena, to: ben, type: LINK.partnerOf }],
		{},
		[],
		[],
		[opa],
		{ [lena]: String(year - 34), [ben]: String(year - 40), [opa]: '1940', [baby]: String(year) }
	);

	await personPage(page, lena);
	await appReady(page);
	await expect(birthdayFact(page)).toContainText('Age');
	await expect(birthdayFact(page)).toContainText('about 34 years');
	await expect(birthdayFact(page)).toContainText(`around ${year - 34}`);
	// The dates editor lists it the same way, marked as an estimate.
	await birthdayFact(page).getByRole('button').first().click();
	await expect(page.getByTestId('dates-list')).toContainText('about 34 years');
	await expect(page.getByTestId('dates-list')).toContainText('estimated');

	await recordAction(page, 'Brief before a visit');
	await expect(page.getByTestId('brief-age')).toHaveText(
		`about 34 years · born around ${year - 34}`
	);
	await expect(page.getByTestId('brief-family').getByRole('link', { name: ben })).toContainText(
		'about 40 years'
	);

	await personPage(page, baby);
	await appReady(page);
	await expect(birthdayFact(page)).toContainText('under 1 year');

	await personPage(page, opa);
	await appReady(page);
	await expect(birthdayFact(page)).toContainText('Born');
	await expect(birthdayFact(page)).toContainText('around 1940');
	await expect(birthdayFact(page)).not.toContainText('about');
});

test('takes an age alone as the estimate, sets it again and removes it with undo in the dates editor', async ({
	page
}) => {
	const year = Number((await serverToday(page)).slice(0, 4));
	const last = `Altereing${runLetters()}`;
	await page.goto('/contacts/new');
	await page.getByText('More — nickname, birthday').click();
	await page.getByLabel('First name').fill('Mara');
	await page.getByLabel('Last name').fill(last);
	await page.getByRole('group', { name: 'Birthday' }).getByLabel('Age', { exact: true }).fill('34');
	await expect(page.getByTestId('date-estimate')).toHaveText(
		`Birthday unknown – about 34 years (around ${year - 34})`
	);
	await page.getByRole('button', { name: 'Add person' }).click();
	await expect(page.getByRole('heading', { name: `Mara ${last}` })).toBeVisible();
	await appReady(page);
	const personUrl = page.url();
	await expect(birthdayFact(page)).toContainText('about 34 years');

	// No day, so nothing for Coming up (F5).
	await page.goto('/');
	await appReady(page);
	await expect(page.locator('[data-testid="coming-up"] li', { hasText: last })).toHaveCount(0);

	await page.goto(personUrl);
	await appReady(page);
	await birthdayFact(page).getByRole('button').first().click();
	const editor = page.locator('[data-fact-editor="dates"]');
	const remove = editor.getByRole('button', { name: 'Remove Age' });
	await remove.click();
	await expect(page.getByTestId('toast-undo')).toContainText('Date removed');
	await expect(remove).toHaveCount(0);
	await page.getByTestId('toast-undo').getByRole('button', { name: 'Undo' }).click();
	await expect(remove).toBeVisible();

	// Set again, it replaces the one before.
	await editor.getByRole('button', { name: 'Add a date' }).click();
	await editor.getByLabel('Kind').selectOption({ label: 'Birthday' });
	await editor.getByLabel('Age', { exact: true }).fill('50');
	await editor.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(editor.getByTestId('dates-list')).toContainText('about 50 years');
	await expect(editor.getByTestId('dates-list')).not.toContainText('about 34 years');

	// Removed for good once the page is left (docs/dev/02 §2.23).
	await editor.getByRole('button', { name: 'Remove Age' }).click();
	await expect(page.getByTestId('toast-undo')).toContainText('Date removed');
	await page.getByRole('link', { name: 'Home', exact: true }).first().click();
	await expect(page.getByRole('heading', { name: 'What happened?' })).toBeVisible();
	await page.goto(personUrl);
	await appReady(page);
	await expect(page.getByRole('heading', { name: `Mara ${last}` })).toBeVisible();
	await expect(page.getByText('about 50 years')).toHaveCount(0);
});

test('the add form without JavaScript sets the estimate too, and a birthday saved with its year clears it (F3)', async ({
	page
}) => {
	const year = Number((await serverToday(page)).slice(0, 4));
	const vera = `Vera Jahrklar${runLetters()}`;
	await seedHousehold(page, [vera], [], {}, [], [], [], { [vera]: String(year - 34) });
	await personPage(page, vera);
	await appReady(page);
	await expect(birthdayFact(page)).toContainText('about 34 years');

	// Without JavaScript the add form posts the age's year to its action, which sets it the same way.
	const posted = await page.request.post(`${page.url()}?/addDate`, {
		form: { kind: 'birthday', date: '', birthYearEstimate: String(year - 36) },
		headers: { origin: new URL(page.url()).origin, accept: 'text/html' }
	});
	expect(posted.ok()).toBe(true);
	await personPage(page, vera);
	await appReady(page);
	await expect(birthdayFact(page)).toContainText('about 36 years');

	await birthdayFact(page).getByRole('button').first().click();
	const editor = page.locator('[data-fact-editor="dates"]');
	await editor.getByRole('button', { name: 'Add a date' }).click();
	await editor.getByLabel('Kind').selectOption({ label: 'Birthday' });
	await fillDate(editor, 'Day', `${year - 30}-03-14`);
	await editor.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(editor.getByRole('button', { name: 'Remove Birthday' })).toBeVisible();
	await expect(editor.getByTestId('dates-list')).not.toContainText('estimated');
	await personPage(page, vera);
	await appReady(page);
	await expect(birthdayFact(page)).toContainText('14 March');
	await expect(birthdayFact(page)).not.toContainText('about');
});

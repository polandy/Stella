import { expect, test, type Page } from '@playwright/test';
import { appReady, recordAction, serverToday, signIn } from './app';
import { LINK, personIdOf, seedHousehold } from './seed';

/*
 * An estimated birth year (docs/dev/02 §2.13.1): the page states it as an age that counts on by
 * itself, the brief beside the family's other ages, and a deceased person's as the year alone.
 * Behaviour the owner chose on 2026-11-15 (F1, F3–F5); the way in is the archive restore for now.
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

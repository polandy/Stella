import { expect, test, type Page } from '@playwright/test';
import { appReady, signIn } from './app';
import { personIdOf, seedHousehold } from './seed';

/*
 * *Settings → Data quality → Same address* (docs/02 §2.2, *Getting homes in*; §2.17): people
 * whose own address lines say the same once case, spaces and punctuation are folded, offered as
 * one home. Written after the owner tried it on a preview (docs/08 §8.4.1).
 *
 * Each case brings its own family, whom no other spec names, and finds its card by a person in
 * it: the suite's household is shared, so other findings may be on the page too. An answer is
 * held for the undo window and only sent when the page is left through the app's own links
 * (`openPeople` in ./app explains why a `page.goto` would race it).
 */

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

const undoToast = (page: Page) => page.getByTestId('toast-undo');
const findingOf = (page: Page, name: string) =>
	page
		.getByTestId('same-address-finding')
		.filter({ has: page.getByRole('link', { name, exact: true }) });

/** From Settings through the Data quality card, then *Check addresses*. */
async function checkFromSettings(page: Page): Promise<void> {
	await page.getByRole('link', { name: /^Same address/ }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Same address' })).toBeVisible();
	await page.getByRole('link', { name: 'Check addresses' }).click();
	await expect(page).toHaveURL(/\?check/);
}

/** Leaves through the back link, which sends a held answer before Settings is read. */
async function backToSettings(page: Page): Promise<void> {
	await page.getByRole('main').getByRole('link', { name: 'Settings' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
}

test('Not the same is remembered until Ask again, and a near-match is never offered', async ({
	page
}) => {
	await seedHousehold(
		page,
		['Ilsabe Quaderer', 'Fridolin Quaderer', 'Zenzi Quaderer'],
		[],
		{},
		[],
		[],
		[],
		{},
		{},
		{
			'Ilsabe Quaderer': 'Quellenweg 7, 4500 Solothurn',
			'Fridolin Quaderer': 'quellenweg 7 · 4500 solothurn',
			// Abbreviated: a near-match, which the check never offers (exact matches only).
			'Zenzi Quaderer': 'Quellenw. 7, 4500 Solothurn'
		}
	);

	// Nothing is read before the check is asked for.
	await page.goto('/settings');
	await appReady(page);
	await page.getByRole('link', { name: /^Same address/ }).click();
	await expect(page.getByTestId('same-address-finding')).toHaveCount(0);
	await page.getByRole('link', { name: 'Check addresses' }).click();

	const finding = findingOf(page, 'Ilsabe Quaderer');
	await expect(finding).toContainText('Quellenweg 7, 4500 Solothurn');
	await expect(finding.getByRole('link', { name: 'Fridolin Quaderer' })).toBeVisible();
	// Each person's own spelling, under their name.
	await expect(finding).toContainText('quellenweg 7 · 4500 solothurn');
	await expect(finding).not.toContainText('Zenzi');
	await expect(findingOf(page, 'Zenzi Quaderer')).toHaveCount(0);

	// *Not the same*: gone at once, back with Undo.
	await finding.getByRole('button', { name: 'Not the same' }).click();
	await expect(undoToast(page)).toContainText('Not the same — the check won’t ask again');
	await expect(finding).toHaveCount(0);
	await undoToast(page).getByRole('button', { name: 'Undo' }).click();
	await expect(finding).toBeVisible();

	// Sent this time: the household's answer, in the drawer on the next check.
	await finding.getByRole('button', { name: 'Not the same' }).click();
	await expect(finding).toHaveCount(0);
	await backToSettings(page);
	await checkFromSettings(page);
	await expect(finding).toHaveCount(0);
	const declined = page.getByTestId('same-address-declined');
	await declined.locator('summary').click();
	const row = declined.getByRole('listitem').filter({ hasText: 'Ilsabe Quaderer' });
	await expect(row).toContainText('Fridolin Quaderer');

	// *Ask again*: the card is back, the drawer no longer holds it.
	await row.getByRole('button', { name: 'Ask again' }).click();
	await expect(finding).toBeVisible();
	await expect(row).toHaveCount(0);
});

test('Make one home moves the people found in, and someone found later joins that home', async ({
	page
}) => {
	await seedHousehold(
		page,
		['Hiltrud Zollinger', 'Gottlieb Zollinger'],
		[],
		{},
		[],
		[],
		[],
		{},
		{},
		{
			'Hiltrud Zollinger': 'Mühlegasse 3, 6003 Luzern',
			'Gottlieb Zollinger': 'mühlegasse 3, 6003 luzern'
		}
	);

	await page.goto('/settings');
	await appReady(page);
	await checkFromSettings(page);
	let finding = findingOf(page, 'Hiltrud Zollinger');
	await expect(finding.getByRole('link', { name: 'Gottlieb Zollinger' })).toBeVisible();

	// *Make one home*: one home of the first person's line, sent when the page is left.
	await finding.getByRole('button', { name: 'Make one home' }).click();
	await expect(undoToast(page)).toContainText(
		/(Hiltrud|Gottlieb) Zollinger and (Gottlieb|Hiltrud) Zollinger live in one home now/
	);
	await expect(finding).toHaveCount(0);
	await backToSettings(page);

	await page.goto(`/contacts/${personIdOf('Gottlieb Zollinger')}`);
	await appReady(page);
	const address = page.getByTestId('identity-facts').locator('[data-fact="address"]');
	// The home has one of the two spellings, and the own copy is gone: one line, not two.
	await expect(address).toContainText(/mühlegasse 3, 6003 luzern/i);
	await expect(address).not.toContainText(/mühlegasse.*mühlegasse/i);
	await expect(address.locator('[data-lives-with]')).toContainText('Hiltrud Zollinger');

	// Their child gets the line as an own address later: offered the home that has it.
	await seedHousehold(
		page,
		['Kunigunde Zollinger'],
		[],
		{},
		[],
		[],
		[],
		{},
		{},
		{
			'Kunigunde Zollinger': 'MÜHLEGASSE 3 6003 LUZERN'
		}
	);
	await page.goto('/settings');
	await appReady(page);
	await checkFromSettings(page);
	finding = findingOf(page, 'Kunigunde Zollinger');
	// Everyone who lives there, in whatever order the home lists them.
	await expect(finding).toContainText(
		/Home of (Hiltrud Zollinger and Gottlieb Zollinger|Gottlieb Zollinger and Hiltrud Zollinger)/
	);
	await finding.getByRole('button', { name: 'Join the home' }).click();
	await expect(undoToast(page)).toContainText('Kunigunde Zollinger moved into the home');
	await backToSettings(page);

	await page.goto(`/contacts/${personIdOf('Kunigunde Zollinger')}`);
	await appReady(page);
	await expect(address).toContainText(/mühlegasse 3, 6003 luzern/i);
	await expect(address).not.toContainText('MÜHLEGASSE');
	await expect(address.locator('[data-lives-with]')).toContainText('Hiltrud Zollinger');
	await expect(address.locator('[data-lives-with]')).toContainText('Gottlieb Zollinger');
});

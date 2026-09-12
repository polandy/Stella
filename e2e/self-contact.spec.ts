import { expect, test, type Page } from '@playwright/test';
import { openPerson, pickPerson, signIn } from './app';

/*
 * Saying which of these people you are (docs/02 §2.1.3). Written after the screens were seen
 * in the running app (docs/08 §8.4.1).
 *
 * The link lives in the profile and the whole suite shares one database, so every case takes
 * it back again — left standing, it would put Sandra in the middle of the map, in the People
 * list and in every relationship form the specs after this file open.
 *
 * Sandra rather than Markus on purpose: Markus is the first person the demo household has, so
 * a map centred on him would pass whether or not anything here works.
 */

const ME = 'Sandra Brunner-Keller';
const ME_ID = 'demo-c-sandra';

/** Says, in Settings, that this is the person you are. */
async function sayIAm(page: Page, name: string): Promise<void> {
	await page.goto('/settings');
	await pickPerson(page.getByLabel('Which of these people is you'), name);
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Saved.')).toBeVisible();
}

/** The id of the person the explorer has put in the middle, as the renderer holds it. */
async function centredPersonId(page: Page): Promise<string | null> {
	await expect(page.locator('canvas').first()).toBeVisible();
	return page.evaluate(() => {
		let el: HTMLElement | null = document.querySelector('canvas');
		while (el && !('_cyreg' in el)) el = el.parentElement;
		const cy = el
			? (el as unknown as { _cyreg: { cy: { $: (s: string) => { map: (f: (n: { id(): string }) => string) => string[] } } } })._cyreg.cy
			: null;
		return cy ? (cy.$('node.center').map((node) => node.id())[0] ?? null) : null;
	});
}

/** The other end of the *Add relationship* form on whichever person's page is open. */
const otherEndField = (page: Page) =>
	page.locator('form[action="?/addRelationship"]').getByLabel('Person');

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test.afterEach(async ({ page }) => {
	await page.goto('/settings');
	const letGo = page.getByRole('button', { name: 'None of them is me' });
	if (await letGo.isVisible()) {
		await letGo.click();
		await expect(letGo).toBeHidden();
	}
});

test('marks the person you say you are, on their page and in the list', async ({ page }) => {
	// Nobody wears the mark while the household has not been told who is who.
	await page.goto('/contacts');
	await expect(page.getByTestId('self-marker')).toHaveCount(0);

	await sayIAm(page, ME);

	await openPerson(page, new RegExp(ME));
	await expect(page.getByTestId('self-marker')).toHaveText('You');

	await page.goto('/contacts');
	const rows = page.getByTestId('people-directory').getByRole('listitem');
	await expect(rows.filter({ hasText: ME }).getByTestId('self-marker')).toBeVisible();
	// Only that one row: the mark says "you", not "somebody".
	await expect(page.getByTestId('self-marker')).toHaveCount(1);
});

test('opens the map on you instead of whoever comes first', async ({ page }) => {
	await page.goto('/graph');
	const firstOfAll = await centredPersonId(page);
	expect(firstOfAll).not.toBeNull();
	expect(firstOfAll).not.toBe(ME_ID);

	await sayIAm(page, ME);

	await page.goto('/graph');
	expect(await centredPersonId(page)).toBe(ME_ID);

	// A link that names somebody still wins: the default is a starting point, not a rule.
	await page.goto('/graph?center=demo-c-hans');
	expect(await centredPersonId(page)).toBe('demo-c-hans');
});

test('starts a new relationship with you as the other end', async ({ page }) => {
	// `openPerson` lands on the People tab, which is where the form lives.
	await openPerson(page, /Bettina Roth/);
	await page.getByRole('button', { name: 'Add relationship' }).click();
	// Nothing is filled in for a household that has not said who anybody is.
	await expect(otherEndField(page)).toHaveValue('');

	await sayIAm(page, ME);

	await openPerson(page, /Bettina Roth/);
	await page.getByRole('button', { name: 'Add relationship' }).click();
	await expect(otherEndField(page)).toHaveValue(ME);

	// Your own page is the one place it would be nonsense, so it is left empty there.
	await openPerson(page, new RegExp(ME));
	await page.getByRole('button', { name: 'Add relationship' }).click();
	await expect(otherEndField(page)).toHaveValue('');
});

test('says it, and takes it back, from the person’s own page', async ({ page }) => {
	await openPerson(page, new RegExp(ME));
	await expect(page.getByTestId('self-marker')).toHaveCount(0);

	await page.getByRole('button', { name: 'This is me' }).click();
	await expect(page.getByTestId('self-marker')).toHaveText('You');
	// It was stored, not only shown: Settings answers with the same person.
	await page.goto('/settings');
	await expect(page.getByLabel('Which of these people is you')).toHaveValue(ME);

	await openPerson(page, new RegExp(ME));
	await page.getByRole('button', { name: 'This is not me' }).click();
	await expect(page.getByTestId('self-marker')).toHaveCount(0);
	await page.goto('/settings');
	await expect(page.getByLabel('Which of these people is you')).toHaveValue('');
});

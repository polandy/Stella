import { expect, test, type Page } from '@playwright/test';
import { appReady, mention, pickPerson, signIn } from './app';
import { personIdOf, seedHousehold } from './seed';

/*
 * One moment about several people (docs/dev/02 §2.20.3): the home offered in one tap in a
 * person's journal and on Home, one row in the stream, the entry in every subject's journal, and
 * the lock chip of a private person once the moment is shared. Written after the maintainer tried
 * it in the running app (docs/dev/08 §8.4.1).
 *
 * The family is invented and in no seed or other spec. The home is made through the address
 * editor, since sharing is what makes it; each moment has its own day, because a second moment
 * for the same people that day joins the first.
 */

test.describe.configure({ mode: 'serial' });

const ANCHOR = 'Ruedi Hochuli';
const OTHERS = ['Vreni Hochuli', 'Lea Hochuli', 'Tim Hochuli'];
const PRIVATE = 'Jonas Hochuli';
const ADDRESS = 'Aarestrasse 7\n3005 Bern';

const composer = (page: Page) => page.getByTestId('story-composer');
const field = (page: Page) => composer(page).getByLabel(/^What happened with/);
const saveButton = (page: Page) => composer(page).getByRole('button', { name: /^Save/ });
const offer = (page: Page) => page.locator('[data-home-offer]');
const offerButton = (page: Page) =>
	page.getByRole('button', { name: 'Add Lea, Tim & Vreni to the moment' });
const subjects = (page: Page) => page.getByRole('group', { name: 'People in this moment' });

async function openPerson(page: Page, name: string): Promise<void> {
	await page.goto(`/contacts/${personIdOf(name)}`);
	await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
	await appReady(page);
}

async function openJournal(page: Page, name: string): Promise<void> {
	await openPerson(page, name);
	await page.getByRole('link', { name: 'Open journal' }).click();
	await expect(page.getByRole('heading', { name: 'Journal' })).toBeVisible();
	await appReady(page);
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('sets up a home of four, with one private member', async ({ page }) => {
	await seedHousehold(
		page,
		[ANCHOR, ...OTHERS, PRIVATE],
		[],
		{},
		[],
		[],
		[],
		{},
		{},
		Object.fromEntries([ANCHOR, ...OTHERS, PRIVATE].map((name) => [name, ADDRESS])),
		{},
		{},
		[PRIVATE]
	);
	await openPerson(page, ANCHOR);
	await page
		.getByTestId('identity-facts')
		.locator('[data-fact="address"]')
		.getByRole('button', { name: /^Edit address/ })
		.click();
	const frame = page.locator('[data-fact-editor="address"]').locator('[data-address]');
	await frame.getByRole('button', { name: 'Also lives here …' }).click();
	const share = frame.getByTestId('share-home');
	for (const name of [...OTHERS, PRIVATE]) await pickPerson(share.getByRole('combobox'), name);
	await share.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.locator('[data-fact-editor="address"]')).toHaveCount(0);
});

test('a journal offers the home, never preselected, and one moment lands in every journal', async ({
	page
}) => {
	await openPerson(page, ANCHOR);
	await page.getByTestId('identity-actions').getByRole('link', { name: 'Write a moment' }).click();
	await expect(subjects(page).locator('[data-subject]')).toHaveCount(0);
	await expect(page.getByText('· goes to Ruedi’s journal')).toBeVisible();
	// The private member waits for a private moment.
	await expect(offer(page)).toContainText('Jonas only in a private moment');

	await offerButton(page).click();
	await expect(subjects(page).locator('[data-subject]')).toHaveCount(3);
	await expect(page.getByText('· goes to 4 journals')).toBeVisible();
	await expect(offer(page)).toHaveCount(0);

	await field(page).fill('Abend am Aareufer mit Fondue');
	await saveButton(page).click();
	await expect(composer(page)).toBeHidden();

	for (const name of [ANCHOR, ...OTHERS]) {
		await openJournal(page, name);
		const entries = page.locator('article', { hasText: 'Abend am Aareufer mit Fondue' });
		await expect(entries).toHaveCount(1);
		const first = name.split(' ')[0];
		const others = [ANCHOR, ...OTHERS].map((n) => n.split(' ')[0]).filter((n) => n !== first);
		for (const other of others) {
			await expect(
				entries.getByTestId('moment-with').getByRole('link', { name: other })
			).toBeVisible();
		}
		await expect(entries.getByTestId('moment-with').getByRole('link', { name: first })).toHaveCount(
			0
		);
	}
});

test('Home offers the home once the first @ names an anchor, and the stream shows one row', async ({
	page
}) => {
	await expect(page.getByLabel('What happened?')).toBeVisible();
	await expect(offer(page)).toHaveCount(0);

	const capture = page.getByLabel('What happened?');
	await capture.pressSequentially('Grillabend bei ');
	await mention(page, 'Ruedi', /Ruedi Hochuli/);
	await expect(offerButton(page)).toBeVisible();
	await offerButton(page).click();
	await expect(page.getByText('· goes to 4 journals')).toBeVisible();

	await capture.pressSequentially('im Garten');
	await page.getByRole('button', { name: /^Save/ }).click();

	const rows = page.locator('article', { hasText: 'Grillabend bei' });
	await expect(rows).toHaveCount(1);
	for (const name of [ANCHOR, ...OTHERS]) {
		await expect(rows.first().getByRole('link', { name }).first()).toBeAttached();
	}
});

test('a private person greys with a lock once the moment is shared, and Save waits', async ({
	page
}) => {
	await openPerson(page, ANCHOR);
	await page.getByTestId('identity-actions').getByRole('link', { name: 'Write a moment' }).click();
	await field(page).fill('Sternenhimmel über dem Garten');
	const save = saveButton(page);

	await page.getByRole('switch', { name: 'Share with household' }).uncheck({ force: true });
	// Private, the whole home is on offer, Jonas with it.
	await page.getByRole('button', { name: 'Add Jonas, Lea, Tim & Vreni to the moment' }).click();
	await expect(subjects(page).locator('[data-subject]')).toHaveCount(4);
	const jonas = subjects(page).locator(`[data-subject="${personIdOf(PRIVATE)}"]`);
	await expect(save).toBeEnabled();
	await expect(jonas.getByRole('img', { name: 'Private' })).toHaveCount(0);

	// Shared again, he is no longer fit: greyed with a lock, and Save says why instead of dropping him.
	await page.getByRole('switch', { name: 'Share with household' }).check({ force: true });
	await expect(save).toBeDisabled();
	await expect(page.getByTestId('save-hint')).toContainText('Jonas Hochuli is private to you');

	await jonas.getByRole('button', { name: 'Remove Jonas Hochuli' }).click();
	await expect(save).toBeEnabled();
});

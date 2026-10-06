import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { addPerson, appReady, openPerson, signIn } from './app';

/*
 * What the performance pass promised to keep while reading less (docs/04 §4.9, §4.4): the
 * pickers take their people from the app shell instead of a page-sized copy, a form submit
 * refreshes that shell without a second freshness check, Home resolves `?about=` on its own,
 * German arrives before the first paint, and a full-size photo is streamed. Written after the
 * maintainer checked them in the running app (docs/08 §8.4.1).
 *
 * The people here (the Quarzbachs) are absent from the demo dataset, and each case adds its
 * own under this attempt's letters, so a retry against the same database finds no earlier
 * attempt's namesake.
 */

const STAMP_PATH = '/api/people/stamp';
const PIXEL = readFileSync('e2e/fixtures/monica-photos/photos/ottilie-avatar.png');

/** Six letters no other attempt shares. */
function runLetters(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) =>
		String.fromCharCode(97 + (byte % 26))
	).join('');
}

/** A surname only this case uses. */
const quarzbach = () => `Quarzbach${runLetters()}`;

/** The id of the person whose page is showing, read from the URL. */
function shownPersonId(page: Page): string {
	const match = new URL(page.url()).pathname.match(/^\/contacts\/([^/]+)/);
	if (!match) throw new Error(`Not on a person page: ${page.url()}`);
	return match[1];
}

/** Clicks one language in the picker and waits for the answer to come back rendered. */
async function chooseLanguage(page: Page, language: string, settled: RegExp): Promise<void> {
	await page.getByRole('button', { name: language }).click();
	await expect(page.getByRole('heading', { name: settled })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('a saved form brings the new person to ⌘K without a second freshness check', async ({
	page
}) => {
	const stampRequests: string[] = [];
	page.on('request', (request) => {
		if (new URL(request.url()).pathname === STAMP_PATH) stampRequests.push(request.url());
	});
	const first = `Isolde${runLetters()}`;

	// The form's redirect reloads the shell; the person it added is in the palette right away.
	await addPerson(page, first, quarzbach());
	await page.keyboard.press('Control+k');
	await page.keyboard.type(first);
	await expect(
		page
			.getByRole('dialog', { name: 'Jump to' })
			.getByRole('option', { name: new RegExp(`^${first}`) })
	).toHaveCount(1);
	await page.keyboard.press('Escape');

	// Positive control: a tab shown again does ask, so the listener above hears the stamp.
	const asked = page.waitForRequest((request) => new URL(request.url()).pathname === STAMP_PATH);
	await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
	await asked;
	// …and that is the only time it asked: the submit's own reload was fresh already.
	expect(stampRequests).toHaveLength(1);
});

test("the journal's @-picker offers the household but not the person the journal belongs to", async ({
	page
}) => {
	const surname = quarzbach();
	await addPerson(page, 'Lorenz', surname);
	await addPerson(page, 'Isolde', surname);

	await page.getByRole('link', { name: 'Write' }).first().click();
	await appReady(page);
	await page.getByRole('button', { name: 'Write a moment' }).click();
	await page.getByRole('textbox', { name: 'Moment', exact: true }).pressSequentially(`@${surname}`);

	const picker = page.getByTestId('mention-picker');
	await expect(picker.getByRole('option', { name: `Lorenz ${surname}` })).toBeVisible();
	await expect(picker.getByRole('option', { name: `Isolde ${surname}` })).toHaveCount(0);
	await page.keyboard.press('Escape');
});

test('the journal lets the viewer edit their own entry, with its text, and not another member’s', async ({
	page
}) => {
	// Hans Brunner's journal holds an entry of the demo admin's and one of Nina's (seed).
	await openPerson(page, /Hans Brunner/);
	await page.getByRole('link', { name: 'Write' }).first().click();
	await appReady(page);

	const mine = page.locator('article', { hasText: '1972 flood' });
	const hers = page.locator('article', { hasText: 'sharpened every knife' });
	await expect(mine.getByRole('button', { name: 'Edit moment' })).toHaveCount(1);
	await expect(hers).toBeVisible();
	await expect(hers.getByRole('button', { name: 'Edit moment' })).toHaveCount(0);

	// The editor opens on the entry as it was written, not on an empty field. Nothing is saved.
	await mine.getByRole('button', { name: 'Edit moment' }).click();
	// The article stops matching once its text is inside the field, so the page is asked; the
	// composer for a new entry is closed, so this is the only field of that name.
	await expect(page.getByRole('textbox', { name: 'Moment', exact: true })).toHaveValue(/1972 flood/);
	await page.getByRole('button', { name: 'Cancel' }).click();
});

test("a circle's picker offers only people who are not in it yet", async ({ page }) => {
	const surname = quarzbach();
	await addPerson(page, 'Lorenz', surname);
	await addPerson(page, 'Isolde', surname);

	await page.goto('/circles');
	await appReady(page);
	await page.getByRole('button', { name: 'New circle' }).click();
	const circle = `Quarzbach club ${runLetters()}`;
	await page.getByLabel('Name').fill(circle);
	await page.getByRole('button', { name: 'Create circle' }).click();
	await expect(page.getByRole('heading', { name: circle })).toBeVisible();
	const circlePage = page.url();

	// Several at once, in one save.
	await page.getByRole('button', { name: 'Add people' }).click();
	const form = page.locator('form[action="?/addMembers"]');
	await form.getByLabel('People').fill(surname);
	await page.getByRole('option', { name: `Isolde ${surname}` }).click();
	await page.getByRole('option', { name: `Lorenz ${surname}` }).click();
	await form.getByRole('button', { name: 'Add', exact: true }).click();
	const grid = page.getByTestId('member-grid');
	await expect(grid.getByRole('link', { name: `Isolde ${surname}` })).toBeVisible();
	await expect(grid.getByRole('link', { name: `Lorenz ${surname}` })).toBeVisible();

	// A third Quarzbach is offered; the two already in the circle are not.
	await addPerson(page, 'Wanda', surname);
	await page.goto(circlePage);
	await expect(page.getByRole('heading', { name: circle })).toBeVisible();
	await appReady(page);
	await page.getByRole('button', { name: 'Add people' }).click();
	await page.locator('form[action="?/addMembers"]').getByLabel('People').fill(surname);
	await expect(page.getByRole('option', { name: `Wanda ${surname}` })).toBeVisible();
	await expect(page.getByRole('option', { name: `Isolde ${surname}` })).toHaveCount(0);
	await expect(page.getByRole('option', { name: `Lorenz ${surname}` })).toHaveCount(0);
});

test('Home opens the composer about the person `?about=` names, and about nobody for an unknown id', async ({
	page
}) => {
	const name = `Isolde ${quarzbach()}`;
	await addPerson(page, 'Isolde', name.split(' ')[1]);
	const id = shownPersonId(page);

	await page.goto(`/?about=${id}`);
	await expect(page.getByText(`Goes to ${name}’s journal`)).toBeVisible();

	await page.goto('/?about=nobody-by-this-id');
	await expect(page.getByRole('heading', { name: 'What happened?' })).toBeVisible();
	await appReady(page);
	await expect(page.getByText('Goes to')).toHaveCount(0);
});

test.describe('in German', () => {
	// The language is stored in the profile and the rest of the suite reads English.
	test.afterEach(async ({ page }) => {
		await page.goto('/settings');
		await chooseLanguage(page, 'English', /^Settings$/);
	});

	test('a page loads in German, and the screens the browser draws itself never show English', async ({
		page
	}) => {
		await page.goto('/settings');
		await chooseLanguage(page, 'Deutsch', /^Einstellungen$/);

		// Watches every change to the page, from its first byte, for an English heading.
		await page.addInitScript(() => {
			const flag = window as unknown as { sawEnglish: boolean };
			flag.sawEnglish = false;
			const english = new Set(['What happened?', 'People']);
			const look = () => {
				for (const heading of document.querySelectorAll('h1, h2')) {
					if (english.has(heading.textContent?.trim() ?? '')) flag.sawEnglish = true;
				}
			};
			new MutationObserver(look).observe(document, {
				subtree: true,
				childList: true,
				characterData: true
			});
		});
		await page.goto('/');
		await expect(page.getByRole('heading', { name: 'Was ist passiert?' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Suche' })).toBeEnabled();
		// A screen the client draws by itself, not the server: it speaks German as well.
		await page.getByRole('link', { name: 'Menschen' }).first().click();
		await expect(page.getByRole('heading', { name: 'Menschen' })).toBeVisible();
		expect(
			await page.evaluate(() => (window as unknown as { sawEnglish: boolean }).sawEnglish)
		).toBe(false);
	});
});

test('a full-size photo opens from the gallery', async ({ page }) => {
	await addPerson(page, 'Isolde', quarzbach());
	await page.getByRole('button', { name: 'Add photos' }).click();
	const form = page.locator('#section-photos form');
	await form
		.locator('input[name=files]')
		.setInputFiles([{ name: 'quarz.png', mimeType: 'image/png', buffer: PIXEL }]);
	await form.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByTestId('photo-grid').getByRole('button').first().click();

	const full = page.getByTestId('photo-lightbox').locator('img').first();
	await expect(full).toHaveAttribute('src', /^\/media\/[^?]+$/);
	await expect
		.poll(() => full.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
		.toBeGreaterThan(0);

	const answer = await page.request.get((await full.getAttribute('src'))!);
	expect(answer.status()).toBe(200);
	expect(answer.headers()['content-type']).toMatch(/^image\//);
	expect(Number(answer.headers()['content-length'])).toBe((await answer.body()).length);
});

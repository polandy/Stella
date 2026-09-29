import { expect, test, type Page } from '@playwright/test';
import { appReady, signIn } from './app';

/*
 * Telling namesakes apart (docs/02 §2.2.3): the second line under a shared name in ⌘K and
 * the person pickers, and the nudge for a description when a last name is missing. Written
 * after the maintainer checked both on the phone (docs/08 §8.4.1).
 *
 * The suite shares one database, so every first name here is absent from the demo seed and
 * from every other spec, and each case adds the people it looks for. The relationship form
 * is opened on a seeded person but never submitted, so nothing is written to them.
 */

const VRENI = 'demo-c-vreni';
const PIXEL_9_PRO = { width: 412, height: 915 };

/** Adds a first-name-only person through *Add a person* and waits for their page. */
async function addFirstNameOnly(page: Page, first: string, fields: { description: string; where?: string }) {
	await page.goto('/contacts/new');
	await appReady(page);
	await page.getByLabel('First name').fill(first);
	await page.getByLabel('Description').fill(fields.description);
	if (fields.where) await page.getByLabel('Where').fill(fields.where);
	await page.getByRole('button', { name: 'Add person' }).click();
	await expect(page.getByRole('heading', { name: first, exact: true })).toBeVisible();
}

/** Six letters no other attempt shares, so a name made from them is this attempt's alone. */
function runLetters(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) => String.fromCharCode(97 + (byte % 26))).join('');
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('asks what to know a first-name-only person by, and lets go once there is a last name', async ({ page }) => {
	await page.goto('/contacts/new');
	await appReady(page);
	const nudge = page.getByTestId('know-them-by');

	await page.getByLabel('First name').fill('Gottfried');
	await expect(nudge).toContainText('Without a last name, “Gottfried” is hard to tell apart later.');

	// A first name alone is not enough to add someone: the form stops at the empty description.
	await page.getByRole('button', { name: 'Add person' }).click();
	await expect(nudge.getByLabel('Description')).toHaveJSProperty('validity.valueMissing', true);
	await expect(page.getByLabel('First name')).toHaveValue('Gottfried');

	await nudge.getByLabel('Description').fill('Met at the Gspaltenhornhütte');

	// A last name is enough to tell him apart: the box goes, the field and what it holds stay.
	await page.getByLabel('Last name').fill('Ammeter');
	await expect(nudge).toHaveCount(0);
	await expect(page.getByLabel(/^Description/)).toHaveValue('Met at the Gspaltenhornhütte');

	await page.getByLabel('Last name').fill('');
	await expect(nudge.getByLabel('Description')).toHaveValue('Met at the Gspaltenhornhütte');

	// Saved with the line they are to be known by, which a first name alone needs.
	await page.getByRole('button', { name: 'Add person' }).click();
	await expect(page.getByRole('heading', { name: 'Gottfried', exact: true })).toBeVisible();
	await expect(page.getByText('Met at the Gspaltenhornhütte')).toBeVisible();
});

test('says which one is which in ⌘K and in a person picker, and leaves a unique name alone', async ({ page }) => {
	// One name per run: a retry, or a local rerun against the same database, would otherwise
	// find the namesakes an earlier attempt left behind and count them too.
	const name = `Leodegar${runLetters()}`;
	// A first name alone needs a description (§2.2.3); the "met" and "nothing yet" lines, for
	// people imported or added before that, are `tellApart`'s unit tests.
	await addFirstNameOnly(page, name, { description: 'SAC hut, Aug 2026' });
	await addFirstNameOnly(page, name, { description: 'Ferry to Spiez' });

	await appReady(page);
	await page.keyboard.press('Control+k');
	const palette = page.getByRole('dialog', { name: 'Jump to' });
	await page.keyboard.type(name);
	// Anchored: the closing "Search everything for …" row carries the name too.
	const found = palette.getByRole('option', { name: new RegExp(`^${name}`) });
	await expect(found).toHaveCount(2);
	await expect(found.filter({ hasText: 'SAC hut, Aug 2026' })).toHaveCount(1);
	await expect(found.filter({ hasText: 'Ferry to Spiez' })).toHaveCount(1);
	await page.keyboard.press('Escape');

	// The same lines where a form asks for a person; a name nobody shares stays one line.
	await page.goto(`/contacts/${VRENI}`);
	await appReady(page);
	await page.getByRole('button', { name: 'Add relationship' }).click();
	const field = page.locator('form[action="?/addRelationship"]').getByLabel('Person');
	await field.fill(name);
	const options = page.getByTestId('person-search-listbox').getByRole('option');
	await expect(options.filter({ hasText: 'SAC hut, Aug 2026' })).toHaveCount(1);
	await expect(options.filter({ hasText: 'Ferry to Spiez' })).toHaveCount(1);
	await expect(options.getByTestId('namesake-line')).toHaveCount(2);
	await field.fill('Thomas Widmer');
	await expect(options).toHaveCount(1);
	await expect(options.getByTestId('namesake-line')).toHaveCount(0);
});

test('keeps the description in view in a picker’s create panel, nudging when there is no last name', async ({ page }) => {
	await page.goto(`/contacts/${VRENI}`);
	await appReady(page);
	await page.getByRole('button', { name: 'Add relationship' }).click();
	const field = page.locator('form[action="?/addRelationship"]').getByLabel('Person');
	await field.fill('Pankraz Gisler');
	await page.getByTestId('person-search-create-option').click();
	const panel = page.getByTestId('person-search-create');

	await expect(panel.getByLabel('Description')).toBeVisible();
	await expect(panel.getByTestId('know-them-by')).toHaveCount(0);

	await panel.getByLabel('Last name').fill('');
	await expect(panel.getByTestId('know-them-by')).toContainText('“Pankraz”');
});

test.describe('on a phone', () => {
	test.use({ viewport: PIXEL_9_PRO, hasTouch: true });

	test('stacks "How we met" above "Where" rather than side by side at two heights', async ({ page }) => {
		// The label of "How we met" wraps on a phone, which dropped its field below its
		// neighbour's. (The fields running past the card's right edge, fixed alongside, only
		// shows on a real Android browser — headless Chromium lets the inputs shrink either way.)
		await page.goto('/contacts/new');
		await appReady(page);

		const howWeMet = await page.getByLabel('How we met').boundingBox();
		const where = await page.getByLabel('Where').boundingBox();
		if (!howWeMet || !where) throw new Error('the meeting fields are not laid out');
		expect(where.y).toBeGreaterThan(howWeMet.y + howWeMet.height);
		expect(where.x).toBe(howWeMet.x);
	});
});

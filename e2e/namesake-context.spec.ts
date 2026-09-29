import { expect, test, type Page } from '@playwright/test';
import { appReady, signIn } from './app';
import { LINK, seedHousehold } from './seed';

/*
 * A namesake with nothing typed to tell them apart falls back on a relationship (docs/02
 * §2.2.3), and the clean-up list fills their description in from it; the @-picker's list stays
 * on screen in the phone's composer sheet (docs/05). Written after the maintainer checked both
 * on the phone (docs/08 §8.4.1).
 *
 * The first-name-only person comes through the archive restore, the way older data got there:
 * a first name alone can no longer be added by hand. Which link wins among several, the circle
 * fallback and what a viewer may not see are the unit and adapter tests' (`rankContext`,
 * `tellApart`, `person-context-reads.test.ts`). Every name carries this attempt's letters, so a
 * retry against the same database never counts an earlier attempt's people.
 */

const PIXEL_9_PRO = { width: 412, height: 915 };

/** Six letters no other attempt shares, so a name made from them is this attempt's alone. */
function runLetters(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) => String.fromCharCode(97 + (byte % 26))).join('');
}

/** A first-name-only namesake linked as sibling of `sister`, and one added by hand with a description. */
async function seedNamesakes(page: Page, name: string, sister: string) {
	await seedHousehold(page, [name, sister], [{ from: name, to: sister, type: LINK.siblingOf }]);
	await page.goto('/contacts/new');
	await appReady(page);
	await page.getByLabel('First name').fill(name);
	await page.getByLabel('Description').fill('Ferry to Spiez');
	await page.getByRole('button', { name: 'Add person' }).click();
	await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('says who a namesake is by their relationship, and offers it as their description', async ({ page }) => {
	const letters = runLetters();
	const name = `Quirin${letters}`;
	const sister = `Sabine${letters} Keller`;
	await seedNamesakes(page, name, sister);

	await page.keyboard.press('Control+k');
	const palette = page.getByRole('dialog', { name: 'Jump to' });
	await page.keyboard.type(name);
	// Anchored: the closing "Search everything for …" row carries the name too.
	const found = palette.getByRole('option', { name: new RegExp(`^${name}`) });
	await expect(found).toHaveCount(2);
	await expect(found.filter({ hasText: `Sibling of ${sister}` })).toHaveCount(1);
	await expect(found.filter({ hasText: 'Ferry to Spiez' })).toHaveCount(1);
	await page.keyboard.press('Escape');

	// The same line is waiting in the clean-up list, to keep as a description with one tap.
	await page.goto('/settings/first-name-only');
	await appReady(page);
	const row = page.getByTestId('first-name-only-row').filter({ has: page.getByRole('link', { name, exact: true }) });
	const field = row.getByRole('textbox', { name: `What will you know ${name} by?` });
	await expect(field).toHaveValue(`Sibling of ${sister}`);
	await row.getByRole('button', { name: 'Save' }).click();
	await expect(row).toHaveCount(0);

	// Stored on the person now, for everyone, not only derived.
	await page.keyboard.press('Control+k');
	await page.keyboard.type(name);
	await expect(found.filter({ hasText: `Sibling of ${sister}` })).toHaveCount(1);
});

test.describe('on a phone', () => {
	test.use({ viewport: PIXEL_9_PRO });

	test('keeps the @-picker\'s list on screen in the composer sheet', async ({ page }) => {
		const letters = runLetters();
		const name = `Quirin${letters}`;
		await seedNamesakes(page, name, `Sabine${letters} Keller`);
		// A full list, as a common first name gives one: five people, two of them on two lines.
		await seedHousehold(page, [`${name} Aebi`, `${name} Baumann`, `${name} Cadonau`]);

		await page.goto('/');
		await appReady(page);
		await page.locator('nav').getByRole('link', { name: 'Write a moment' }).click();
		const sheet = page.getByTestId('compose-sheet');
		await expect(sheet).toBeVisible();
		await page.getByLabel('What happened?').pressSequentially(`@${name}`);

		const list = sheet.getByRole('listbox');
		await expect(list.getByRole('option', { name: new RegExp(`^${name}`) })).toHaveCount(5);
		const box = await list.boundingBox();
		expect(box!.y).toBeGreaterThanOrEqual(0);
		expect(box!.y + box!.height).toBeLessThanOrEqual(PIXEL_9_PRO.height);
	});
});

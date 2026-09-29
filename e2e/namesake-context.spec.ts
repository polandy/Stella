import { expect, test, type Page } from '@playwright/test';
import { appReady, signIn } from './app';
import { LINK, seedHousehold } from './seed';

/*
 * A namesake with nothing typed to tell them apart falls back on a relationship (docs/02
 * §2.2.3) in ⌘K, in every picker and in the refusal of a text sent later, and the clean-up list fills their description in from it; the @-picker's list stays
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
/** A seeded person whose page offers a note field and the relationship form; neither is saved. */
const VRENI = 'demo-c-vreni';

/** Six letters no other attempt shares, so a name made from them is this attempt's alone. */
function runLetters(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) => String.fromCharCode(97 + (byte % 26))).join('');
}

/** A command id no other attempt shares: a ULID's 26 Crockford base-32 characters. */
function commandId(): string {
	const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
	return Array.from(crypto.getRandomValues(new Uint8Array(26)), (byte) => alphabet[byte % 32]).join('');
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

test('names a namesake by their relationship when a text sent later is refused for a typed @Name', async ({ page }) => {
	const letters = runLetters();
	const name = `Quirin${letters}`;
	const sister = `Sabine${letters} Keller`;
	await seedNamesakes(page, name, sister);

	// What a phone's outbox sends once Stella is in reach again (docs/concepts/offline-capture.md
	// §4): the writing screen asks first, but a text kept on the phone meets the server's
	// question — a note, a moment and a journal entry each.
	const body = `Called @${name}`;
	const day = '2026-09-01';
	const sent = [
		{ type: 'note.add', payload: { contactId: VRENI, body, visibility: 'shared', isPinned: false } },
		{ type: 'moment.capture', payload: { body, entryDate: day, visibility: 'shared', newPeople: [] } },
		{ type: 'journal.write', payload: { contactId: VRENI, entryDate: day, title: null, body, visibility: 'shared' } }
	];
	const response = await page.request.post('/api/commands', {
		data: { commands: sent.map((c) => ({ id: commandId(), issuedAt: Date.now(), ...c })) }
	});
	expect(response.ok()).toBe(true);
	const answers: { status: string; reason?: string }[] = (await response.json()).answers;
	expect(answers).toHaveLength(sent.length);
	for (const answer of answers) {
		expect(answer.status).toBe('refused');
		expect(answer.reason).toContain(`@${name} could be 2 people:`);
		expect(answer.reason).toContain(`${name} (Sibling of ${sister})`);
		expect(answer.reason).toContain(`${name} (Ferry to Spiez)`);
	}
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

	// Every picker reads the same line, whichever list its page handed it: a note's @-picker…
	await page.goto(`/contacts/${VRENI}`);
	await appReady(page);
	await page.getByRole('button', { name: 'Add note' }).click();
	await page.getByRole('textbox', { name: 'Note' }).pressSequentially(`@${name}`);
	const mentioned = page.getByRole('option', { name: new RegExp(`^${name}`) });
	await expect(mentioned.filter({ hasText: `Sibling of ${sister}` })).toHaveCount(1);
	await page.getByRole('textbox', { name: 'Note' }).fill('');

	// …and the person picker of the relationship form.
	await page.getByRole('button', { name: 'Add relationship' }).click();
	await page.locator('form[action="?/addRelationship"]').getByLabel('Person').fill(name);
	const offered = page.getByTestId('person-search-listbox').getByRole('option');
	await expect(offered.filter({ hasText: `Sibling of ${sister}` })).toHaveCount(1);

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

	test('says who a namesake is in the composer sheet, keeping the @-picker\'s list on screen', async ({ page }) => {
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
		await expect(list.getByRole('option').filter({ hasText: `Sibling of Sabine${letters} Keller` })).toHaveCount(1);
		const box = await list.boundingBox();
		expect(box!.y).toBeGreaterThanOrEqual(0);
		expect(box!.y + box!.height).toBeLessThanOrEqual(PIXEL_9_PRO.height);
	});
});

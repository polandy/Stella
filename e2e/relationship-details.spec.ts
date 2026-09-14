import { expect, test, type Locator, type Page } from '@playwright/test';
import { fillDate, openPerson, pickPerson, signIn } from './app';

/*
 * What a relationship carries beyond its type, and taking one back (docs/02 §2.4). Written
 * after the flow was verified in the running app (docs/08 §8.4.1).
 *
 * The suite shares one demo database and runs serially, so these cases work on Bettina Roth,
 * who has no relationships at all and whom no other spec names, each enters the link it needs
 * rather than leaning on the one before, and the Brunner family is put back as it was.
 */

async function openPeopleTab(page: Page, name: RegExp): Promise<void> {
	await openPerson(page, name);
}

/**
 * One entered relationship, by the name at its other end. Scoped to the first list in the
 * panel: the derived relatives below it are rows too, and only the entered ones are editable.
 */
const enteredRow = (page: Page, otherName: string) =>
	page.locator('#section-relationships ul').first().locator('li').filter({ hasText: otherName });

/** Fills the *Add relationship* form and submits it. */
async function addLink(
	page: Page,
	fields: { type: string; person: string; how?: string; since?: string; status?: string }
): Promise<void> {
	await page.getByRole('button', { name: 'Add relationship' }).click();
	const form = page.locator('form[action="?/addRelationship"]');
	await form.locator('select[name=typeChoice]').selectOption({ label: fields.type });
	await pickPerson(form.getByLabel('Person'), fields.person);
	if (fields.how) await form.locator('input[name=description]').fill(fields.how);
	if (fields.since) await fillDate(form, 'Since', fields.since);
	if (fields.status) await form.locator('select[name=status]').selectOption(fields.status);
	await form.getByRole('button', { name: 'Add', exact: true }).click();
}

const HOW = 'met on the Gurten in a downpour';

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('enters a link with how they connect, since when, and whether it still holds', async ({ page }) => {
	await openPeopleTab(page, /Bettina Roth/);
	await addLink(page, {
		type: 'Knows',
		person: 'Heidi Lehmann',
		how: HOW,
		since: '2019-06-01',
		status: 'former'
	});

	const row = enteredRow(page, 'Heidi Lehmann');
	await expect(row).toContainText(HOW);
	await expect(row).toContainText('since 1 June 2019');
	await expect(row).toContainText('former');

	// It was stored, not just shown: it survives a reload.
	await page.reload();
	await expect(enteredRow(page, 'Heidi Lehmann')).toContainText('since 1 June 2019');
});

test('enters a link from the other side: "child of" needs no detour via the other profile', async ({ page }) => {
	await openPeopleTab(page, /Bettina Roth/);
	// The reverse side of an asymmetric type is on offer, so the sentence can be said the way
	// round it is being read here (docs/02 §2.4).
	await addLink(page, { type: 'Child of', person: 'Kurt Lehmann' });
	await expect(enteredRow(page, 'Kurt Lehmann')).toContainText('Child of');

	// One canonical row, not a second kind of link: from Kurt it reads as the forward side.
	await openPeopleTab(page, /Kurt Lehmann/);
	await expect(enteredRow(page, 'Bettina Roth')).toContainText('Parent of');
});

/*
 * The contradiction guard (docs/02 §2.4). Runs on Nicole Frei and Heidi Lehmann, who are not
 * linked to each other by the seed or by any other case, and enters the link it contradicts
 * itself rather than leaning on the case above.
 */
test('refuses a generation claimed in both directions, and writes nothing', async ({ page }) => {
	await openPeopleTab(page, /Nicole Frei/);
	await addLink(page, { type: 'Parent of', person: 'Heidi Lehmann' });
	await expect(enteredRow(page, 'Heidi Lehmann')).toContainText('Parent of');

	// The same two people, the same type, the other way round: nobody is their own parent's
	// parent, so this is turned away with the reason rather than stored.
	await addLink(page, { type: 'Child of', person: 'Heidi Lehmann' });
	await expect(page.locator('#section-relationships')).toContainText('already linked the other way round');

	// The positive signal: exactly one row still names Heidi and it reads the way it was
	// entered. Reloading proves the server wrote nothing, not just that the page did not move.
	await page.reload();
	await expect(enteredRow(page, 'Heidi Lehmann')).toHaveCount(1);
	await expect(enteredRow(page, 'Heidi Lehmann')).toContainText('Parent of');
	await expect(enteredRow(page, 'Heidi Lehmann')).not.toContainText('Child of');
});

test('corrects the specifics from the row, the type picker preset to the link', async ({ page }) => {
	await openPeopleTab(page, /Bettina Roth/);
	await addLink(page, { type: 'Knows', person: 'Jan Steiner', how: HOW, since: '2019-06-01', status: 'former' });

	const row = enteredRow(page, 'Jan Steiner');
	await row.getByRole('button', { name: 'Edit' }).click();

	const editor = page.locator('form[action="?/editRelationship"]');
	// The type is on offer again, preset to what the link says today (docs/02 §2.4).
	await expect(editor.locator('select[name=typeChoice]')).toHaveValue(/./);
	await expect(
		editor.locator('select[name=typeChoice] option:checked')
	).toHaveText('Knows');
	await expect(editor.locator('input[name=description]')).toHaveValue(HOW);

	await editor.locator('input[name=description]').fill('walked the Gurten every spring');
	await editor.locator('select[name=status]').selectOption('current');
	await editor.getByRole('button', { name: 'Save' }).click();

	await expect(row).toContainText('walked the Gurten every spring');
	await expect(row).not.toContainText('former');
	await expect(row).toContainText('since 1 June 2019'); // untouched by the edit
});

test('takes a link back with Undo, and the worked-out name returns with it', async ({ page }) => {
	// Nadia is Hans's son's partner: nobody entered that, Stella works it out.
	await openPeopleTab(page, /Hans Brunner/);
	await expect(page.getByTestId('derived-kin')).toContainText('Nadia Brunner-Rossi');

	// An entered link keeps the household's own wording, so the derived one steps aside.
	await addLink(page, { type: 'Knows', person: 'Nadia Brunner-Rossi' });
	await expect(page.getByTestId('derived-kin')).not.toContainText('Nadia Brunner-Rossi');

	await enteredRow(page, 'Nadia Brunner-Rossi')
		.getByRole('button', { name: 'Remove the link to Nadia Brunner-Rossi' })
		.click();

	// Gone from the list at once, and nothing has reached the server yet.
	const toast = page.getByTestId('toast-undo');
	await expect(toast).toContainText('Relationship removed');
	await toast.getByRole('button', { name: 'Undo' }).click();
	await page.reload();
	await expect(enteredRow(page, 'Nadia Brunner-Rossi')).toHaveCount(1);

	// Remove it for real: leaving the page sends it, and the worked-out name is back.
	await enteredRow(page, 'Nadia Brunner-Rossi')
		.getByRole('button', { name: 'Remove the link to Nadia Brunner-Rossi' })
		.click();
	await expect(page.getByTestId('toast-undo')).toBeVisible();
	await openPeopleTab(page, /Hans Brunner/);
	await expect(page.getByTestId('derived-kin')).toContainText('Nadia Brunner-Rossi');
	await expect(page.locator('#section-relationships ul').first()).not.toContainText('Nadia Brunner-Rossi');
});

/*
 * Changing the type of a link that is already there (docs/02 §2.4). Written after the flow
 * was verified in the running app (docs/08 §8.4.1).
 */

/** Opens one row's editor and hands back the form inside it. */
async function openEditor(page: Page, row: Locator): Promise<Locator> {
	await row.getByRole('button', { name: 'Edit' }).click();
	return page.locator('form[action="?/editRelationship"]');
}

/** What the type picker in a row's editor stands on. */
const presetType = (editor: Locator) => editor.locator('select[name=typeChoice] option:checked');

test('changes the type from the row, keeping what the link said', async ({ page }) => {
	await openPeopleTab(page, /Bettina Roth/);
	await addLink(page, {
		type: 'Partner of',
		person: 'Reto Hofer',
		how: HOW,
		since: '2011-08-20',
		status: 'current'
	});

	const editor = await openEditor(page, enteredRow(page, 'Reto Hofer'));
	await expect(presetType(editor)).toHaveText('Partner of');
	await editor.locator('select[name=typeChoice]').selectOption({ label: 'Spouse of' });
	await editor.getByRole('button', { name: 'Save' }).click();

	// The tie changed name; what was written about it did not.
	const row = enteredRow(page, 'Reto Hofer');
	await expect(row).toContainText('Spouse of');
	await expect(row).toContainText(HOW);
	await expect(row).toContainText('since 20 August 2011');

	// Stored, not just shown.
	await page.reload();
	await page.getByRole('tab', { name: /People/ }).click();
	await expect(enteredRow(page, 'Reto Hofer')).toContainText('Spouse of');

	/*
	 * The same row from the other end. A symmetric type is offered once, from its forward
	 * side, while the link reads as the reverse side on the endpoint it is stored second — so
	 * exactly one of these two pages is that endpoint, and the picker must stand on the link
	 * on both. Preselecting nothing there would let a select fall back to its first entry and
	 * a save of the specifics alone retype the link.
	 */
	await openPeopleTab(page, /Reto Hofer/);
	await expect(enteredRow(page, 'Bettina Roth')).toContainText('Spouse of');
	await expect(presetType(await openEditor(page, enteredRow(page, 'Bettina Roth')))).toHaveText(
		'Spouse of'
	);
});

test('turns a generation round from the row, rather than refusing it as its own contradiction', async ({ page }) => {
	/*
	 * Nicole and Bettina are linked by neither the seed nor any case above, so the only
	 * generation between them is the one entered here — the wrong way round on purpose.
	 */
	await openPeopleTab(page, /Nicole Frei/);
	await addLink(page, { type: 'Child of', person: 'Bettina Roth' });

	const editor = await openEditor(page, enteredRow(page, 'Bettina Roth'));
	await expect(presetType(editor)).toHaveText('Child of');
	await editor.locator('select[name=typeChoice]').selectOption({ label: 'Parent of' });
	await editor.getByRole('button', { name: 'Save' }).click();

	// The guard that refuses a generation claimed both ways leaves the link itself out of the
	// question, so the row turns round instead of being turned away.
	await expect(page.locator('#panel-people')).not.toContainText('already linked the other way round');
	await expect(enteredRow(page, 'Bettina Roth')).toContainText('Parent of');

	// One row, moved — not a second one: from Bettina it now reads as the other side.
	await openPeopleTab(page, /Bettina Roth/);
	await expect(enteredRow(page, 'Nicole Frei')).toHaveCount(1);
	await expect(enteredRow(page, 'Nicole Frei')).toContainText('Child of');
});

test('refuses a type that would duplicate a link already there, and writes nothing', async ({ page }) => {
	// Nicole and Jan are linked by neither the seed nor any case above; both links here are
	// entered by this case.
	await openPeopleTab(page, /Nicole Frei/);
	await addLink(page, { type: 'Knows', person: 'Jan Steiner' });
	await addLink(page, { type: 'Neighbor of', person: 'Jan Steiner', how: 'two floors up' });

	// Two rows now name Jan; the one being retyped is the neighbour link.
	const neighbourRow = enteredRow(page, 'Jan Steiner').filter({ hasText: 'Neighbor of' });
	const editor = await openEditor(page, neighbourRow);
	await editor.locator('select[name=typeChoice]').selectOption({ label: 'Knows' });
	await editor.getByRole('button', { name: 'Save' }).click();
	await expect(page.locator('#panel-people')).toContainText('That relationship already exists.');

	// The positive signal: both links are still there, each reading as it was entered, and a
	// reload proves the server wrote nothing rather than the page merely not moving.
	await page.reload();
	await page.getByRole('tab', { name: /People/ }).click();
	const rows = enteredRow(page, 'Jan Steiner');
	await expect(rows).toHaveCount(2);
	await expect(rows.filter({ hasText: 'Neighbor of' })).toContainText('two floors up');
	await expect(rows.filter({ hasText: 'Knows' })).toHaveCount(1);
});

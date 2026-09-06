import { expect, test, type Page } from '@playwright/test';
import { openPerson, signIn } from './app';

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
	await page.getByRole('tab', { name: /People/ }).click();
}

/**
 * One entered relationship, by the name at its other end. Scoped to the first list in the
 * panel: the derived relatives below it are rows too, and only the entered ones are editable.
 */
const enteredRow = (page: Page, otherName: string) =>
	page.locator('#panel-people ul').first().locator('li').filter({ hasText: otherName });

/** Fills the *Add relationship* form and submits it. */
async function addLink(
	page: Page,
	fields: { type: string; person: string; how?: string; since?: string; status?: string }
): Promise<void> {
	await page.getByRole('button', { name: 'Add relationship' }).click();
	const form = page.locator('form[action="?/addRelationship"]');
	await form.locator('select[name=typeId]').selectOption({ label: fields.type });
	await form.locator('select[name=targetId]').selectOption({ label: fields.person });
	if (fields.how) await form.locator('input[name=description]').fill(fields.how);
	if (fields.since) await form.locator('input[name=sinceDate]').fill(fields.since);
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
	await page.getByRole('tab', { name: /People/ }).click();
	await expect(enteredRow(page, 'Heidi Lehmann')).toContainText('since 1 June 2019');
});

test('corrects the specifics from the row, and never offers the type', async ({ page }) => {
	await openPeopleTab(page, /Bettina Roth/);
	await addLink(page, { type: 'Knows', person: 'Jan Steiner', how: HOW, since: '2019-06-01', status: 'former' });

	const row = enteredRow(page, 'Jan Steiner');
	await row.getByRole('button', { name: 'Edit' }).click();

	const editor = page.locator('form[action="?/editRelationship"]');
	// Changing the type could flip the stored direction, so it is not on offer here.
	await expect(editor.locator('select[name=typeId]')).toHaveCount(0);
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
	await page.getByRole('tab', { name: /People/ }).click();
	await expect(enteredRow(page, 'Nadia Brunner-Rossi')).toHaveCount(1);

	// Remove it for real: leaving the page sends it, and the worked-out name is back.
	await enteredRow(page, 'Nadia Brunner-Rossi')
		.getByRole('button', { name: 'Remove the link to Nadia Brunner-Rossi' })
		.click();
	await expect(page.getByTestId('toast-undo')).toBeVisible();
	await openPeopleTab(page, /Hans Brunner/);
	await expect(page.getByTestId('derived-kin')).toContainText('Nadia Brunner-Rossi');
	await expect(page.locator('#panel-people ul').first()).not.toContainText('Nadia Brunner-Rossi');
});

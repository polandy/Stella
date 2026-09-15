import { expect, test, type Page } from '@playwright/test';
import { addPerson, openPerson, pickPerson, signIn } from './app';

/*
 * A partnership marked *former* stops carrying step-family (docs/02 §2.4, §2.4.1). Written
 * after the fix was verified in the running app (docs/08 §8.4.1).
 *
 * The family is built from scratch — the demo dataset has no step-family, and inventing
 * three people keeps this case from colliding with anything the Brunners assert elsewhere in
 * the serial suite.
 */

const PARENT = { first: 'Gian', last: 'Casutt' };
const CHILD = { first: 'Elin', last: 'Casutt' };
const EX = { first: 'Vera', last: 'Moser' };

const fullName = (who: { first: string; last: string }) => `${who.first} ${who.last}`;

/** Fills the *Add relationship* form on the open person and submits it. */
async function addLink(
	page: Page,
	fields: { type: string; person: string; status?: string }
): Promise<void> {
	await page.getByRole('button', { name: 'Add relationship' }).click();
	const form = page.locator('form[action="?/addRelationship"]');
	await form.locator('select[name=typeChoice]').selectOption({ label: fields.type });
	await pickPerson(form.getByLabel('Person'), fields.person);
	if (fields.status) await form.locator('select[name=status]').selectOption(fields.status);
	await form.getByRole('button', { name: 'Add', exact: true }).click();
}

const enteredRow = (page: Page, otherName: string) =>
	page.locator('#section-relationships ul').first().locator('li').filter({ hasText: otherName });

test('stops naming an ex-partner a stepparent, without dropping the link', async ({ page }) => {
	await signIn(page);
	await addPerson(page, CHILD.first, CHILD.last);
	await addPerson(page, EX.first, EX.last);
	await addPerson(page, PARENT.first, PARENT.last);

	await addLink(page, { type: 'Parent of', person: fullName(CHILD) });
	await addLink(page, { type: 'Partner of', person: fullName(EX), status: 'current' });

	// While the partnership holds, Vera is Elin's stepparent — nobody entered that, Stella
	// works it out. This is the positive control for the disappearance below.
	await openPerson(page, new RegExp(fullName(CHILD)));
	const derived = page.getByTestId('derived-kin');
	await expect(derived).toContainText('Step-parent');
	await expect(derived).toContainText(fullName(EX));

	// Gian and Vera separate: the row says so, and the worked-out stepparent goes with it.
	await openPerson(page, new RegExp(fullName(PARENT)));
	await enteredRow(page, fullName(EX)).getByRole('button', { name: 'Edit' }).click();
	const editor = page.locator('form[action="?/editRelationship"]');
	await editor.locator('select[name=status]').selectOption('former');
	await editor.getByRole('button', { name: 'Save' }).click();
	await expect(enteredRow(page, fullName(EX))).toContainText('former');

	await openPerson(page, new RegExp(fullName(CHILD)));
	// Elin's only worked-out relative came through that partnership, so the block is gone.
	await expect(page.getByTestId('derived-kin')).toHaveCount(0);
	// The partnership itself is untouched — a status is not a delete.
	await openPerson(page, new RegExp(fullName(PARENT)));
	await expect(enteredRow(page, fullName(EX))).toBeVisible();
});

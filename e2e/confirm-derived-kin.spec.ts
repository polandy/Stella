import { expect, test, type Page } from '@playwright/test';
import { addPerson, editPeople, openPerson, pickPerson, signIn } from './app';

/*
 * A worked-out relative can be confirmed, which stores it as an entered link (docs/02
 * §2.4.1). Written after the owner verified it in the running app (docs/08 §8.4.1).
 *
 * The family is built from scratch: confirming a Brunner relative would take them out of the
 * derived block that `kinship.spec.ts` asserts on in the same serial suite.
 */

const GRANDPARENT = { first: 'Otto', last: 'Caviezel' };
const PARENT = { first: 'Rita', last: 'Caviezel' };
const CHILD = { first: 'Nils', last: 'Caviezel' };

const fullName = (who: { first: string; last: string }) => `${who.first} ${who.last}`;

/** Fills the *Add relationship* form on the open person and submits it. */
async function addLink(page: Page, fields: { type: string; person: string }): Promise<void> {
	await page.getByRole('button', { name: 'Add relationship' }).click();
	const form = page.locator('form[action="?/addRelationship"]');
	await form.locator('select[name=typeChoice]').selectOption({ label: fields.type });
	await pickPerson(form.getByLabel('Person'), fields.person);
	await form.getByRole('button', { name: 'Add', exact: true }).click();
}

const enteredRow = (page: Page, otherName: string) =>
	page.getByTestId('relationship-list').locator('li').filter({ hasText: otherName });

test('confirms a worked-out grandparent in place, storing it as an entered link', async ({
	page
}) => {
	await signIn(page);
	await addPerson(page, GRANDPARENT.first, GRANDPARENT.last);
	await addPerson(page, CHILD.first, CHILD.last);
	await addPerson(page, PARENT.first, PARENT.last);
	await addLink(page, { type: 'Child of', person: fullName(GRANDPARENT) });
	await expect(enteredRow(page, fullName(GRANDPARENT))).toBeVisible();
	await addLink(page, { type: 'Parent of', person: fullName(CHILD) });
	await expect(enteredRow(page, fullName(CHILD))).toBeVisible();

	await openPerson(page, new RegExp(fullName(CHILD)));
	const derivedRow = page
		.getByTestId('derived-kin')
		.locator('li')
		.filter({ hasText: fullName(GRANDPARENT) });
	await expect(derivedRow).toContainText('Grandparent');
	await expect(derivedRow).toContainText(`via ${fullName(PARENT)}`);

	// A full reload would drop this; its surviving the confirm is what "in place" means.
	await page.evaluate(() => Object.assign(window, { stayedOnPage: true }));
	const before = page.url();
	// Confirming is a correction, so it is offered in the card's edit mode.
	await editPeople(page);
	await derivedRow.getByRole('button', { name: 'Confirm' }).click();

	// Stored: it now reads like any entered link, and the worked-out row has gone.
	await expect(enteredRow(page, fullName(GRANDPARENT))).toContainText('Grandparent');
	await expect(page.getByTestId('derived-kin')).toHaveCount(0);
	expect(await page.evaluate(() => 'stayedOnPage' in window)).toBe(true);
	expect(page.url()).toBe(before);
});

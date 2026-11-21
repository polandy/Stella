import { expect, test, type Page } from '@playwright/test';
import { addPerson, pickPerson, signIn } from './app';
import { arrangeBy, arrangement, settled } from './graph-canvas';

/*
 * A lone parent's children in the family tree (docs/dev/02 §2.7, docs/dev/05 §5.8): a child entered
 * under only one parent, while that parent stands beside the other parent of their shared children,
 * stands on that parent's outer side, so the two bars never share a stretch under the couple.
 *
 * The family is made from scratch so nothing the demo family asserts elsewhere shifts.
 */

const FATHER = { first: 'Reto', last: 'Bundi' };
const MOTHER = { first: 'Mena', last: 'Bundi' };
const SHARED = { first: 'Flurin', last: 'Bundi' };
const fullName = (who: { first: string; last: string }) => `${who.first} ${who.last}`;

/** The id of the person whose page is open. */
function contactId(page: Page): string {
	const id = new URL(page.url()).pathname.split('/')[2];
	if (!id) throw new Error(`not on a person's page: ${page.url()}`);
	return id;
}

/** Adds a relationship from the open person's page. */
async function relate(page: Page, type: string, other: string): Promise<void> {
	await page.getByRole('button', { name: 'Add relationship' }).click();
	const form = page.locator('form[action="?/addRelationship"]');
	await form.locator('select[name=typeChoice]').selectOption({ label: type });
	await pickPerson(form.getByLabel('Person'), other);
	await form.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(
		page.getByTestId('relationship-list').locator('li').filter({ hasText: other })
	).toBeVisible();
}

test("a child under one parent of a couple stands on that parent's outer side, not under the couple", async ({
	page
}) => {
	await signIn(page);
	await addPerson(page, FATHER.first, FATHER.last);
	const father = contactId(page);
	await addPerson(page, MOTHER.first, MOTHER.last);
	const mother = contactId(page);
	await relate(page, 'Spouse of', fullName(FATHER));
	await addPerson(page, SHARED.first, SHARED.last);
	const shared = contactId(page);
	await relate(page, 'Child of', fullName(FATHER));
	await relate(page, 'Child of', fullName(MOTHER));
	await addPerson(page, 'Gion', 'Bundi');
	const lone = contactId(page);
	await relate(page, 'Child of', fullName(FATHER));

	await page.goto(`/graph?center=${father}`);
	await expect(page.locator('canvas').first()).toBeVisible();
	await settled(page);
	await arrangeBy(page, 'Tree');
	await settled(page);

	const placed = await arrangement(page);
	const at = (id: string) => placed.get(id)!;
	expect(at(mother).y).toBe(at(father).y);
	expect(at(shared).y).toBe(at(lone).y);
	// Away from Mena: past Reto on the side she does not stand on, never between the two.
	const outward = Math.sign(at(father).x - at(mother).x);
	expect(Math.sign(at(lone).x - at(father).x)).toBe(outward);
	expect(Math.sign(at(shared).x - at(lone).x)).toBe(-outward);
});

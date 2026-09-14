import { expect, test } from '@playwright/test';
import { openPerson, signIn } from './app';

/*
 * Where a card's add-form opens, and what happens to the cursor (docs/05 §5.7). The defect
 * this guards against is invisible from the source: on a person with a dozen relationships
 * the form rendered below the list, a screen and a half under the button that asked for it,
 * so pressing *Add relationship* looked like it did nothing. Written after the maintainer
 * saw the change live (docs/08 §8.4.1).
 */

test.beforeEach(async ({ page }) => {
	await signIn(page);
	await openPerson(page, /Lena Brunner/);
});

const RELATIONSHIP_FORM = 'form[action="?/addRelationship"]';

test('opens the add-relationship form under the header and above the list, cursor inside', async ({
	page
}) => {
	const panel = page.locator('#panel-people');
	const firstRow = panel.locator('li').first();
	await expect(firstRow).toBeVisible();

	await panel.getByRole('button', { name: 'Add relationship' }).click();

	const form = panel.locator(RELATIONSHIP_FORM);
	await expect(form).toBeVisible();
	// The measurement is the point: with both laid out, the form sits above the relationships
	// rather than after them — which is what a person with a dozen links could not see.
	expect((await form.boundingBox())!.y).toBeLessThan((await firstRow.boundingBox())!.y);

	// And it opens ready to type — the first control that can hold a cursor, not the button.
	await expect(form.locator('select[name="typeChoice"]')).toBeFocused();
});

test('Escape closes the form and hands the cursor back to the button that opened it', async ({
	page
}) => {
	const panel = page.locator('#panel-people');
	const add = panel.getByRole('button', { name: 'Add relationship' });
	await add.click();
	await expect(panel.locator(RELATIONSHIP_FORM)).toBeVisible();

	await page.keyboard.press('Escape');

	await expect(panel.locator(RELATIONSHIP_FORM)).toHaveCount(0);
	await expect(add).toBeFocused();
});

test('dismissing the person picker keeps the half-filled form it sits in', async ({ page }) => {
	const panel = page.locator('#panel-people');
	await panel.getByRole('button', { name: 'Add relationship' }).click();
	const form = panel.locator(RELATIONSHIP_FORM);

	const description = form.getByPlaceholder('met through Peter at the ski course');
	await description.fill('rowing club');
	const picker = form.getByLabel('Person');
	await picker.click();
	await picker.fill('Vreni');
	await expect(page.getByRole('option', { name: /Vreni/ })).toBeVisible();

	await page.keyboard.press('Escape');

	// The list goes; the form and what was typed into it stay.
	await expect(page.getByRole('option', { name: /Vreni/ })).toHaveCount(0);
	await expect(form).toBeVisible();
	await expect(description).toHaveValue('rowing club');
});

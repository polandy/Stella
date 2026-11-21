import { expect, test } from '@playwright/test';
import { addPerson, editPeople, fillDate, signIn } from './app';

/*
 * A parent link's kind (docs/dev/02 §2.4): chosen in the form, named on the profile, changed in
 * the editor. Both people are named here, absent from the seed and from every other spec.
 */

test('a foster parent is named by the kind and the kind can be changed afterwards', async ({
	page
}) => {
	await signIn(page);
	await addPerson(page, 'Linus', 'Pflegerhof');

	await page.getByRole('button', { name: 'Add relationship' }).click();
	const form = page.locator('form[action="?/addRelationship"]');
	await form.locator('select[name=typeChoice]').selectOption({ label: 'Child of' });
	await expect(form.getByTestId('parent-kind-biological').locator('input')).toBeChecked();
	await form.getByTestId('parent-kind-foster').click();
	await expect(form).toContainText('Several foster families in turn are fine');

	const field = form.getByLabel('Person');
	await field.click();
	await field.fill('Wiebke Obhutmann');
	await page.getByTestId('person-search-create-option').click();
	await page.getByRole('button', { name: 'Add & select' }).click();
	await expect(page.getByTestId('toasts')).toContainText('Wiebke Obhutmann was added');

	await fillDate(form, 'Since', '2015-01-01');
	await fillDate(form, 'Until', '2018-06-30');
	await form.getByRole('button', { name: 'Add', exact: true }).click();

	const row = page
		.getByTestId('relationship-list')
		.locator('li')
		.filter({ hasText: 'Wiebke Obhutmann' });
	await expect(row).toContainText('Foster parent');
	await expect(row).toContainText('2015–2018');

	await editPeople(page);
	await row.getByRole('button', { name: 'Edit' }).click();
	const editor = page.locator('form[action="?/editRelationship"]');
	await expect(editor.getByTestId('parent-kind-foster').locator('input')).toBeChecked();
	await editor.getByTestId('parent-kind-step').click();
	await editor.getByRole('button', { name: 'Save' }).click();

	await expect(row).toContainText('Step-parent');
	await page.reload();
	await expect(row).toContainText('Step-parent');
});

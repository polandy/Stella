import { expect, test } from '@playwright/test';
import { appReady, fillDate, signIn } from './app';

/*
 * The until day of a link and the childminder type (docs/dev/02 §2.4). Written after the flow
 * was verified in the running app (docs/dev/08 §8.4.1). Both people are named here, absent from
 * the seed and from every other spec.
 */

test('a link that ended in the past is saved as former and reads as a span of years', async ({
	page
}) => {
	await signIn(page);
	await page.goto('/contacts/new');
	await page.getByLabel('First name').fill('Marianne');
	await page.getByLabel('Last name').fill('Tagesmueller');
	await page.getByRole('button', { name: 'Add person' }).click();
	await expect(page.getByRole('heading', { name: 'Marianne Tagesmueller' })).toBeVisible();
	await appReady(page);

	await page.getByRole('button', { name: 'Add relationship' }).click();
	const form = page.locator('form[action="?/addRelationship"]');
	await form.locator('select[name=typeChoice]').selectOption({ label: 'Looks after' });

	const field = form.getByLabel('Person');
	await field.click();
	await field.fill('Noemi Hostettler');
	await page.getByTestId('person-search-create-option').click();
	await page.getByRole('button', { name: 'Add & select' }).click();
	await expect(page.getByTestId('toasts')).toContainText('Noemi Hostettler was added');

	await fillDate(form, 'Since', '2015-01-01');
	await fillDate(form, 'Until', '2018-06-30');
	await form.getByRole('button', { name: 'Add', exact: true }).click();

	const row = page
		.getByTestId('relationship-list')
		.locator('li')
		.filter({ hasText: 'Noemi Hostettler' });
	await expect(row).toContainText('2015–2018');
	await expect(row).toContainText('former');
	await page.reload();
	await expect(row).toContainText('2015–2018');
});

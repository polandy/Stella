import { expect, test, type Locator, type Page } from '@playwright/test';
import { openPerson, signIn } from './app';

/*
 * The person search's result list never hides the form's buttons for good (docs/05 §5.7):
 * a tap beside it closes it and keeps the picks, and it opens upwards when the room below is
 * tight. Checked on the relationship form, on a phone and on a desktop.
 */

const SIZES = [
	{ label: 'phone', width: 412, height: 915 },
	{ label: 'desktop', width: 1280, height: 800 }
];

async function openForm(page: Page): Promise<Locator> {
	await openPerson(page, /Beat Steiner/);
	await page.getByRole('button', { name: 'Add relationship' }).click();
	const form = page
		.locator('#section-relationships form')
		.filter({ has: page.locator('select[name=typeChoice]') });
	await expect(form).toBeVisible();
	return form;
}

const panel = (page: Page) => page.getByTestId('person-search-panel');

for (const size of SIZES) {
	test.describe(size.label, () => {
		test.use({ viewport: { width: size.width, height: size.height } });

		test.beforeEach(async ({ page }) => {
			await signIn(page);
		});

		test('a tap beside the field closes the list and keeps the pick', async ({ page }) => {
			const form = await openForm(page);
			const field = form.getByLabel('Person');
			await field.click();
			await field.fill('Noah');
			await page.getByTestId('person-search-listbox').getByRole('option').first().click();
			const chips = form.getByTestId('person-search-chip');
			await expect(chips).toHaveCount(1);

			await field.fill('a');
			await expect(panel(page)).toBeVisible();
			await page.mouse.click(1, 1);
			await expect(panel(page)).toHaveCount(0);
			await expect(chips).toHaveCount(1);
		});

		test('Escape closes the list and keeps the pick', async ({ page }) => {
			const form = await openForm(page);
			const field = form.getByLabel('Person');
			await field.click();
			await field.fill('Noah');
			await page.getByTestId('person-search-listbox').getByRole('option').first().click();
			await field.fill('a');
			await expect(panel(page)).toBeVisible();
			await page.keyboard.press('Escape');
			await expect(panel(page)).toHaveCount(0);
			await expect(form.getByTestId('person-search-chip')).toHaveCount(1);
		});

		test('the submit button stays reachable after the list closes', async ({ page }) => {
			const form = await openForm(page);
			const field = form.getByLabel('Person');
			await field.click();
			await field.fill('Noah');
			await page.getByTestId('person-search-listbox').getByRole('option').first().click();
			await field.fill('a');
			await page.mouse.click(1, 1);
			await expect(panel(page)).toHaveCount(0);
			await expect(form.getByRole('button', { name: /^Add/ })).toBeEnabled();
			await form.getByRole('button', { name: /^Add/ }).click({ trial: true });
		});
	});
}

test.describe('tight room below, as with the on-screen keyboard', () => {
	test.use({ viewport: { width: 412, height: 500 } });

	test('opens upwards and leaves the buttons below the field uncovered', async ({ page }) => {
		await signIn(page);
		const form = await openForm(page);
		const field = form.getByLabel('Person');
		await field.click();
		await field.fill('a');

		const open = panel(page);
		await expect(open).toBeVisible();
		await expect(open).toHaveAttribute('data-side', 'above');
		const [box, input] = await Promise.all([open.boundingBox(), field.boundingBox()]);
		expect(box!.y + box!.height).toBeLessThanOrEqual(input!.y + 1);
		expect(box!.y).toBeGreaterThanOrEqual(0);
	});
});

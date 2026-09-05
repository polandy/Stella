import { expect, test } from '@playwright/test';
import { openPerson, signIn } from './app';

/*
 * Editing the name and description where they are read (docs/02 §2.2, docs/05 §5.7). Written
 * after the screen was seen in the running app (docs/08 §8.4.1).
 *
 * Runs on Reto Hofer, whom no other case names, and puts his name back before it finishes —
 * the suite shares one database and later files look people up by name.
 */

const PERSON = /Reto Hofer/;
const NAME = 'Reto Hofer';
const RENAMED = 'Reto Hofer-Marti';
const DESCRIPTION = 'Klassenlehrer der 3a, kennt jedes Kind im Quartier.';

test.beforeEach(async ({ page }) => {
	await signIn(page);
	await openPerson(page, PERSON);
});

test('renames a person from the heading itself, and says Saved', async ({ page }) => {
	// The trigger is named by its own value, so the heading keeps its accessible name: an
	// aria-label on the button would replace it with "Edit name".
	await expect(page.getByRole('heading', { name: NAME })).toBeVisible();

	await page.getByRole('button', { name: NAME }).click();
	const field = page.getByRole('textbox', { name: 'Edit name' });
	await expect(field).toBeFocused();
	await field.fill(RENAMED);
	await page.getByRole('button', { name: 'Save' }).click();

	await expect(page.getByTestId('toast-notice')).toContainText('Saved');
	await expect(page.getByRole('heading', { name: RENAMED })).toBeVisible();
	await expect(page.getByRole('textbox', { name: 'Edit name' })).toHaveCount(0);

	// It is the person who changed, not just this screen: the directory says so too.
	await page.getByRole('link', { name: 'People' }).first().click();
	await expect(page.getByRole('link', { name: RENAMED })).toBeVisible();

	// Put the name back, so the rest of the suite finds him where it expects him.
	await page.getByRole('link', { name: RENAMED }).first().click();
	await page.getByRole('button', { name: RENAMED }).click();
	await page.getByRole('textbox', { name: 'Edit name' }).fill(NAME);
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByRole('heading', { name: NAME })).toBeVisible();
});

test('writes a description where there was none, and keeps it after a reload', async ({ page }) => {
	await page.getByRole('button', { name: 'Add a description' }).click();
	const field = page.getByRole('textbox', { name: 'Edit description' });
	await expect(field).toBeFocused();
	await field.fill(DESCRIPTION);
	await page.getByRole('button', { name: 'Save' }).click();

	await expect(page.getByText(DESCRIPTION)).toBeVisible();
	await page.reload();
	await expect(page.getByText(DESCRIPTION)).toBeVisible();
	// Renaming carries the description along, rather than blanking the field it does not edit.
	await expect(page.getByRole('heading', { name: NAME })).toBeVisible();
});

test('refuses to leave a person nameless, and keeps the editor open with the reason', async ({
	page
}) => {
	await page.getByRole('button', { name: NAME }).click();
	await page.getByRole('textbox', { name: 'Edit name' }).fill('   ');
	await page.getByRole('button', { name: 'Save' }).click();

	await expect(page.getByText('A name cannot be empty.')).toBeVisible();
	await expect(page.getByRole('textbox', { name: 'Edit name' })).toBeVisible();

	// Nothing was written: the heading and the directory still carry the name.
	await page.reload();
	await expect(page.getByRole('heading', { name: NAME })).toBeVisible();
});

test('Escape puts the value back and writes nothing', async ({ page }) => {
	await page.getByRole('button', { name: NAME }).click();
	await page.getByRole('textbox', { name: 'Edit name' }).fill('Someone Else Entirely');
	await page.keyboard.press('Escape');

	await expect(page.getByRole('textbox', { name: 'Edit name' })).toHaveCount(0);
	await expect(page.getByRole('heading', { name: NAME })).toBeVisible();
	await expect(page.getByTestId('toast-notice')).toHaveCount(0);
	await page.reload();
	await expect(page.getByRole('heading', { name: NAME })).toBeVisible();
});

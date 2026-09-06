import { expect, test, type Page } from '@playwright/test';
import { appReady, openPerson, signIn } from './app';

/*
 * A household naming its own kinds of link (docs/02 §2.4). Written after the flow was
 * verified in the running app (docs/08 §8.4.1).
 *
 * The suite shares one demo database and runs serially, so every case invents its own type
 * name — the Brunners' vocabulary is the twelve built-in ones — and puts back whatever it
 * entered. Thomas Widmer carries the one link these cases need; no other spec names him.
 */

/** One row of the household's own types, by its label. */
const customRow = (page: Page, label: string) =>
	page.getByTestId('custom-types').locator('li').filter({ hasText: label });

/*
 * Reached through the app's own links rather than `goto`: a browser-level navigation ends a
 * pending removal with a keepalive request nobody waits for, and these cases read the list
 * back straight afterwards.
 */
async function openTypeSettings(page: Page): Promise<void> {
	await page.getByRole('link', { name: 'Settings' }).first().click();
	await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
	await page.getByRole('link', { name: 'Relationship types' }).click();
	await expect(page.getByRole('heading', { name: 'Relationship types' })).toBeVisible();
	await appReady(page);
}

/** Fills the *Add type* form and submits it. */
async function addType(
	page: Page,
	fields: { label: string; category: string; otherSide?: string }
): Promise<void> {
	await page.getByRole('button', { name: 'Add type' }).click();
	const form = page.locator('form[action="?/add"]');
	await form.locator('input[name=forwardLabel]').fill(fields.label);
	await form.locator('select[name=category]').selectOption(fields.category);
	if (fields.otherSide) {
		await form.locator('input[name=symmetric]').uncheck();
		await form.locator('input[name=reverseLabel]').fill(fields.otherSide);
	}
	await form.getByRole('button', { name: 'Add', exact: true }).click();
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('names a kind of link of its own, and every person page offers it', async ({ page }) => {
	await openTypeSettings(page);
	await addType(page, { label: 'Godparent of', category: 'family', otherSide: 'Godchild of' });

	const row = customRow(page, 'Godparent of');
	await expect(row).toContainText('from the other side: Godchild of');
	await expect(row).toContainText('family');

	// The promise is that it reaches the picker on a person's page, not just this list.
	await openPerson(page, /Thomas Widmer/);
	await page.getByRole('tab', { name: /People/ }).click();
	await page.getByRole('button', { name: 'Add relationship' }).click();
	const typePicker = page.locator('form[action="?/addRelationship"] select[name=typeId]');
	await expect(typePicker.locator('option', { hasText: 'Godparent of' })).toHaveCount(1);
});

test('will not remove a type while links still use it', async ({ page }) => {
	// The type from the case above is still unused: the button is there to begin with.
	await openTypeSettings(page);
	const row = customRow(page, 'Godparent of');
	await expect(row.getByRole('button', { name: /^Remove the type/ })).toHaveCount(1);

	await openPerson(page, /Thomas Widmer/);
	await page.getByRole('tab', { name: /People/ }).click();
	await page.getByRole('button', { name: 'Add relationship' }).click();
	const form = page.locator('form[action="?/addRelationship"]');
	await form.locator('select[name=typeId]').selectOption({ label: 'Godparent of' });
	await form.locator('select[name=targetId]').selectOption({ label: 'Bettina Roth' });
	await form.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.locator('#panel-people')).toContainText('Bettina Roth');

	await openTypeSettings(page);
	await expect(row).toContainText('used 1×');
	await expect(row.getByRole('button', { name: /^Remove the type/ })).toHaveCount(0);

	// Put Thomas back as he was; the button returns with the last link gone.
	await openPerson(page, /Thomas Widmer/);
	await page.getByRole('tab', { name: /People/ }).click();
	await page
		.locator('#panel-people')
		.getByRole('button', { name: 'Remove the link to Bettina Roth' })
		.click();
	await expect(page.getByTestId('toast-undo')).toBeVisible();

	await openTypeSettings(page);
	await expect(row).not.toContainText('used');
	await expect(row.getByRole('button', { name: /^Remove the type/ })).toHaveCount(1);
});

test('refuses a label that already names a type, and writes nothing', async ({ page }) => {
	await openTypeSettings(page);
	const before = await page.getByTestId('custom-types').locator('li').count();

	await addType(page, { label: 'Friend of', category: 'social' });

	await expect(page.getByText('A relationship type named like "Friend of" already exists.')).toBeVisible();
	await expect(page.getByTestId('custom-types').locator('li')).toHaveCount(before);
});

test('leaves the built-in types alone', async ({ page }) => {
	await openTypeSettings(page);
	const builtIn = page.getByTestId('built-in-types');

	await expect(builtIn.locator('li')).toHaveCount(12);
	await expect(builtIn).toContainText('Parent of');
	// They are part of the app, so the list offers nothing to do to them.
	await expect(builtIn.getByRole('button')).toHaveCount(0);
});

test('removes a type nothing uses, with Undo', async ({ page }) => {
	await openTypeSettings(page);
	await addType(page, { label: 'Sings with', category: 'social' });
	await expect(customRow(page, 'Sings with')).toHaveCount(1);

	await customRow(page, 'Sings with')
		.getByRole('button', { name: 'Remove the type Sings with' })
		.click();
	const toast = page.getByTestId('toast-undo');
	await expect(toast).toContainText('Relationship type removed');

	// Undo puts it back, and nothing ever reached the server.
	await toast.getByRole('button', { name: 'Undo' }).click();
	await page.reload();
	await expect(customRow(page, 'Sings with')).toHaveCount(1);

	// For real this time: leaving the page commits it.
	await customRow(page, 'Sings with')
		.getByRole('button', { name: 'Remove the type Sings with' })
		.click();
	await expect(page.getByTestId('toast-undo')).toBeVisible();
	await openTypeSettings(page);
	await expect(customRow(page, 'Sings with')).toHaveCount(0);
});

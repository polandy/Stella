import { expect, test } from '@playwright/test';
import { appReady, identityRow, openPerson, signIn } from './app';
import { LINK, seedHousehold } from './seed';

/*
 * A person's gender, set from the identity card and while adding them (docs/02 §2.2). Written
 * after the owner tried it in the running app (docs/08 §8.4.1).
 *
 * The profile case brings its own family, which no other spec names: Olga is the sister of
 * Kim's mother Ines, so Kim's page works out an aunt — or, with no gender on record, an aunt or
 * uncle. What the gender changes is seen where it matters, on the relative's page.
 */

const AUNT = 'Olga Aregger';
const MOTHER = 'Ines Aregger';
const CHILD = 'Kim Aregger';
const LONER = 'Pia Aregger';

// The stored session is enough without JavaScript; `signIn` waits for a shell that never mounts there.
test.beforeEach(async ({ page, javaScriptEnabled }) => {
	if (javaScriptEnabled) await signIn(page);
});

test('sets a gender with one tap, names relatives by it, and takes it back with another', async ({ page }) => {
	await seedHousehold(
		page,
		[AUNT, MOTHER, CHILD],
		[
			{ from: MOTHER, to: AUNT, type: LINK.siblingOf },
			{ from: MOTHER, to: CHILD, type: LINK.parentOf }
		]
	);

	// Nothing on record yet: the relative is named neutrally.
	await openPerson(page, new RegExp(CHILD));
	await expect(page.getByTestId('derived-kin')).toContainText(AUNT);
	await expect(page.getByTestId('derived-kin')).toContainText('Aunt or uncle');

	await openPerson(page, new RegExp(AUNT));
	// Nothing on record, so the row waits behind the identity card's quiet button.
	const row = await identityRow(page, page.locator('[data-row="gender"]'));
	await expect(row).toContainText('Not on record');

	await row.getByRole('button', { name: /^Gender/ }).click();
	await row.getByRole('button', { name: 'Female', exact: true }).click();
	await expect(page.getByTestId('toast-notice')).toContainText('Saved');
	await expect(row).toContainText('Female');
	await expect(row.getByRole('button', { name: 'Male', exact: true })).toHaveCount(0);

	// Kept, and it is the relative's wording that changed.
	await page.reload();
	await expect(row).toContainText('Female');
	await openPerson(page, new RegExp(CHILD));
	const derived = page.getByTestId('derived-kin');
	await expect(derived).toContainText(AUNT);
	await expect(derived).toContainText('Aunt');
	await expect(derived).not.toContainText('Aunt or uncle');

	// Diverse keeps the wording neutral, like nothing on record.
	await openPerson(page, new RegExp(AUNT));
	await row.getByRole('button', { name: /^Gender/ }).click();
	await row.getByRole('button', { name: 'Diverse', exact: true }).click();
	await expect(row).toContainText('Diverse');
	await openPerson(page, new RegExp(CHILD));
	await expect(page.getByTestId('derived-kin')).toContainText('Aunt or uncle');

	// A tap on the chosen chip takes the gender off the record.
	await openPerson(page, new RegExp(AUNT));
	await row.getByRole('button', { name: /^Gender/ }).click();
	await expect(row.getByRole('button', { name: 'Diverse', exact: true })).toHaveAttribute('aria-pressed', 'true');
	await row.getByRole('button', { name: 'Diverse', exact: true }).click();
	await expect(row).toContainText('Not on record');
});

test('Escape closes the chips without changing anything', async ({ page }) => {
	// A person of its own: the seed adds each name once, and the case above owns the family.
	await seedHousehold(page, [LONER]);
	await openPerson(page, new RegExp(LONER));
	const row = await identityRow(page, page.locator('[data-row="gender"]'));
	const before = await row.innerText();

	await row.getByRole('button', { name: /^Gender/ }).click();
	await expect(row.getByRole('button', { name: 'Female', exact: true })).toBeVisible();
	await page.keyboard.press('Escape');

	await expect(row.getByRole('button', { name: /^Gender/ })).toBeVisible();
	await expect(row.getByRole('button', { name: 'Female', exact: true })).toHaveCount(0);
	expect(await row.innerText()).toBe(before);
});

/*
 * The form's own action, which is what saves a person when the page runs without JavaScript;
 * with it, the chips above go through the command outbox instead.
 */
test.describe('without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test('keeps the gender chosen while adding someone', async ({ page }) => {
		await page.goto('/contacts/new');
		await page.getByLabel('First name').fill('Leonie');
		await page.getByLabel('Last name').fill('Zumstein');
		await page.getByText('Diverse', { exact: true }).click();
		await expect(page.getByRole('radio', { name: 'Diverse', exact: true })).toBeChecked();
		await page.getByRole('button', { name: 'Add person' }).click();

		await expect(page.getByRole('heading', { name: 'Leonie Zumstein' })).toBeVisible();
		await expect(page.locator('[data-row="gender"]')).toContainText('Diverse');
	});
});

test('asks for a gender while adding someone, and lets a second tap take the choice back', async ({ page }) => {
	await page.goto('/contacts/new');
	await appReady(page);
	await page.getByLabel('First name').fill('Nora');
	await page.getByLabel('Last name').fill('Zumstein');

	const male = page.getByRole('radio', { name: 'Male', exact: true });
	await page.getByText('Male', { exact: true }).click();
	await expect(male).toBeChecked();
	await page.getByText('Male', { exact: true }).click();
	await expect(male).not.toBeChecked();

	await page.getByText('Female', { exact: true }).click();
	await expect(page.getByRole('radio', { name: 'Female', exact: true })).toBeChecked();
	await page.getByRole('button', { name: 'Add person' }).click();

	await expect(page.getByRole('heading', { name: 'Nora Zumstein' })).toBeVisible();
	await expect(page.locator('[data-row="gender"]')).toContainText('Female');
});

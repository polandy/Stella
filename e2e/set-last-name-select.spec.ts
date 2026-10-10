import { expect, test, type Page } from '@playwright/test';
import { addPerson, appReady, openPeople, signIn } from './app';

/*
 * *Select* → *Set last name* on People (docs/02 §2.2.4.3): with nobody to lose a last name,
 * *Set* writes straight away; when someone already has a different one, a confirmation names
 * them unticked, and *Replace all* ticks them together. Written after the owner tried it on a
 * preview (docs/08 §8.4.1). The names are used by no other case and not by the demo household.
 */

async function addFirstNameOnly(page: Page, first: string): Promise<void> {
	await page.goto('/contacts/new');
	await page.getByLabel('First name').fill(first);
	await page.getByLabel('Description').fill('Met at the Grimsel dam');
	await page.getByRole('button', { name: 'Add person' }).click();
	await expect(page.getByRole('heading', { name: first })).toBeVisible();
	await appReady(page);
}

/**
 * Leaves for Home and comes back through the nav: a client-side navigation flushes the batch
 * held in the undo window before it goes (e2e/app.ts, `openPeople`), so the list shows what was
 * written, and a repeat of the spec starts from people who already carry their names.
 */
async function writtenOnPeople(page: Page, names: readonly string[]): Promise<void> {
	await page.getByRole('link', { name: 'Home' }).first().click();
	await openPeople(page);
	for (const name of names)
		await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
}

async function selectOnPeople(page: Page, names: readonly string[]): Promise<void> {
	await page.goto('/contacts');
	await appReady(page);
	await page.getByRole('button', { name: 'Select…' }).click();
	for (const name of names) await page.getByLabel(`Choose ${name}`, { exact: true }).check();
	await page.getByRole('button', { name: 'Set last name' }).click();
}

test('with nobody to lose a last name, Set writes straight away', async ({ page }) => {
	await signIn(page);
	await addFirstNameOnly(page, 'Quirinus');
	await addFirstNameOnly(page, 'Ottiliane');

	await selectOnPeople(page, ['Quirinus', 'Ottiliane']);
	const panel = page.getByTestId('set-last-name');
	await panel.getByLabel('Set last name').fill('Ruefenachtli');
	await expect(panel.getByRole('button', { name: 'Next' })).toHaveCount(0);
	await panel.getByRole('button', { name: 'Set', exact: true }).click();

	await expect(
		page.getByTestId('toast-undo').filter({ hasText: 'Last name Ruefenachtli set for 2 people' })
	).toBeVisible();
	await writtenOnPeople(page, ['Quirinus Ruefenachtli', 'Ottiliane Ruefenachtli']);
});

test('a different last name is asked about, and Replace all ticks every one of them', async ({
	page
}) => {
	await signIn(page);
	await addFirstNameOnly(page, 'Leodegar');
	await addPerson(page, 'Severina', 'Haldimannli');
	await addPerson(page, 'Vrenelia', 'Brügglerin');

	await selectOnPeople(page, ['Leodegar', 'Severina Haldimannli', 'Vrenelia Brügglerin']);
	const panel = page.getByTestId('set-last-name');
	await panel.getByLabel('Set last name').fill('Zbindenmatt');
	// Enter must open the question, not skip it.
	await panel.getByLabel('Set last name').press('Enter');

	await expect(panel.getByText('Set Zbindenmatt for 1 person.')).toBeVisible();
	const severina = panel.getByLabel(
		'Severina Haldimannli already has the last name Haldimannli — replace it'
	);
	const vrenelia = panel.getByLabel(
		'Vrenelia Brügglerin already has the last name Brügglerin — replace it'
	);
	await expect(severina).not.toBeChecked();
	await expect(vrenelia).not.toBeChecked();

	const all = panel.getByLabel('Replace all 2');
	await all.check();
	await expect(severina).toBeChecked();
	await expect(vrenelia).toBeChecked();
	await expect(panel.getByText('Set Zbindenmatt for 3 people.')).toBeVisible();

	// One row unticked by hand: *Replace all* no longer holds.
	await vrenelia.uncheck();
	await expect(all).not.toBeChecked();
	await expect(panel.getByText('Set Zbindenmatt for 2 people.')).toBeVisible();

	await all.check();
	await expect(panel.getByText('Set Zbindenmatt for 3 people.')).toBeVisible();
	await panel.getByRole('button', { name: 'Set', exact: true }).click();
	await expect(
		page.getByTestId('toast-undo').filter({ hasText: 'Last name Zbindenmatt set for 3 people' })
	).toBeVisible();
	await writtenOnPeople(page, [
		'Leodegar Zbindenmatt',
		'Severina Zbindenmatt',
		'Vrenelia Zbindenmatt'
	]);
});

import { expect, test } from '@playwright/test';
import { appReady, signIn } from './app';

/*
 * The *Last names* review (docs/02 §2.2.4.2): *Not …* drops one proposal and never the person,
 * and *No last name* settles someone until *Ask again*. Written after the owner tried it on a
 * preview (docs/08 §8.4.1).
 *
 * Wendelin is added with a description (a first name alone is refused) and shown as *Wendelin
 * Zwahlenried* with his last name empty, so Stella's one proposal is *Zwahlenried*, read off
 * his own shown name. Declining his only proposal puts him under *No suggestion* — the section
 * that crashed the page before. Neither name is used by the demo household or any other case.
 */

const FIRST = 'Wendelin';
const SHOWN = 'Wendelin Zwahlenried';
const SURNAME = 'Zwahlenried';

test('declining the only proposal keeps the person, and No last name settles them until Ask again', async ({
	page
}) => {
	await signIn(page);

	await page.goto('/contacts/new');
	await page.getByLabel('First name').fill(FIRST);
	await page.getByLabel('Description').fill('Alpine guide from the Gauli hut');
	await page.getByRole('button', { name: 'Add person' }).click();
	await expect(page.getByRole('heading', { name: FIRST })).toBeVisible();
	await appReady(page);
	await page.getByRole('button', { name: FIRST, exact: true }).click();
	await page.getByRole('textbox', { name: 'Shown as' }).fill(SHOWN);
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByRole('heading', { name: SHOWN })).toBeVisible();

	await page.goto('/settings/last-names');
	await appReady(page);
	const group = page
		.getByTestId('last-name-group')
		.filter({ has: page.getByRole('heading', { name: new RegExp(`^${SURNAME}`) }) });
	await expect(group.getByText(SHOWN, { exact: true })).toBeVisible();

	// *Not Zwahlenried*: his only proposal goes, he does not.
	await group.getByLabel(`More for ${SHOWN}`).click();
	await group.getByRole('button', { name: `Not ${SURNAME}` }).click();
	await expect(
		page
			.getByTestId('toast-undo')
			.filter({ hasText: `${SURNAME} won’t be proposed for ${SHOWN} again.` })
	).toBeVisible();
	await expect(group).toHaveCount(0);
	const fields = page.getByTestId('last-name-fields');
	await expect(fields.getByRole('link', { name: SHOWN, exact: true })).toBeVisible();
	await expect(page.getByText('Names you said no to')).toBeVisible();

	// *No last name*: off the list and into the drawer, with Undo.
	await fields.getByLabel(`More for ${SHOWN}`).click();
	await fields.getByRole('button', { name: 'No last name' }).click();
	await expect(
		page.getByTestId('toast-undo').filter({ hasText: `${SHOWN} is fine without a last name.` })
	).toBeVisible();
	await expect(page.getByRole('link', { name: SHOWN, exact: true })).toHaveCount(0);

	// The household's answer, not this screen's: it holds after a reload, in the drawer.
	await page.reload();
	await appReady(page);
	const settled = page.getByTestId('last-names-settled');
	await settled.getByText(/Without a last name/).click();
	await expect(settled.getByRole('link', { name: SHOWN, exact: true })).toBeVisible();
	await expect(fields.getByRole('link', { name: SHOWN, exact: true })).toHaveCount(0);

	// *Ask again*: back on the list, under *No suggestion*.
	await settled.getByRole('button', { name: `Ask again about ${SHOWN}` }).click();
	await expect(fields.getByRole('link', { name: SHOWN, exact: true })).toBeVisible();
	await expect(settled.getByRole('link', { name: SHOWN, exact: true })).toHaveCount(0);
});

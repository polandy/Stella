import { expect, test, type Locator, type Page } from '@playwright/test';
import { addPerson, profileRow, signIn } from './app';

/*
 * The links of the *Contact* row (docs/dev/02 §2.3): a phone is tap-to-call, an email tap-to-mail,
 * a website opens as written or with `https://` put in front. Written after the row was seen in
 * the running app (docs/dev/08 §8.4.1).
 *
 * A social handle is plain text, so only its listing is held here; the address's map link is in
 * identity-facts.spec.ts.
 */

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

/** Adds one detail through the row's form, then waits until it is listed. */
async function addDetail(page: Page, kind: string, label: string, value: string): Promise<Locator> {
	const contact = await profileRow(page, 'Contact');
	await contact.getByRole('button', { name: 'Add', exact: true }).first().click();
	await contact.getByLabel('Kind').selectOption({ label: kind });
	await contact.getByPlaceholder('Label (optional)').fill(label);
	await contact.getByPlaceholder('Value').fill(value);
	await contact.getByRole('button', { name: 'Add', exact: true }).last().click();
	const shown = contact.getByText(value, { exact: true });
	await expect(shown).toBeVisible();
	return shown;
}

test('a phone, an email and a website become links, a social handle is only listed', async ({
	page
}) => {
	await addPerson(page, 'Linnea', 'Tobelmann');

	const phone = await addDetail(page, 'Phone', 'Mobile', '+41 79 555 01 23');
	await expect(phone).toHaveAttribute('href', 'tel:+41795550123');

	const email = await addDetail(page, 'Email', 'Home', 'linnea@tobelmann.example');
	await expect(email).toHaveAttribute('href', 'mailto:linnea@tobelmann.example');

	// Written without a scheme, the website opens over https.
	const bare = await addDetail(page, 'Website', 'Shop', 'tobelmann.example/laden');
	await expect(bare).toHaveAttribute('href', 'https://tobelmann.example/laden');

	// Written with one, it is left as it is.
	const plain = await addDetail(page, 'Website', 'Old shop', 'http://alt.tobelmann.example');
	await expect(plain).toHaveAttribute('href', 'http://alt.tobelmann.example');

	const social = await addDetail(page, 'Social', 'Fediverse', '@linnea@tobelmann.example');
	await expect(social).toBeVisible();

	// Kept across a visit.
	await page.reload();
	const contact = await profileRow(page, 'Contact');
	await expect(contact.getByRole('link', { name: '+41 79 555 01 23' })).toHaveAttribute(
		'href',
		'tel:+41795550123'
	);
	await expect(contact.getByRole('link', { name: 'linnea@tobelmann.example' })).toHaveAttribute(
		'href',
		'mailto:linnea@tobelmann.example'
	);
	await expect(contact.getByText('@linnea@tobelmann.example')).toBeVisible();
});

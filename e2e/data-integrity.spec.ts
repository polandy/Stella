import { expect, test, type Page } from '@playwright/test';
import { addPerson, appReady, pickPerson, recordAction, signIn } from './app';

/*
 * Two rules that keep the household's records where they belong (docs/02 §2.2, §2.12): a
 * shared person is never merged into a private one, and an archived person's notes leave the
 * search with them. Written after the owner's OK (docs/08 §8.4.1). The people are the spec's
 * own and their surnames carry letters no other run shares.
 */

function runLetters(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) =>
		String.fromCharCode(97 + (byte % 26))
	).join('');
}

/** Adds a person kept to the signed-in account through the real form, and lands on their page. */
async function addPrivatePerson(page: Page, first: string, last: string): Promise<void> {
	await page.goto('/contacts/new');
	await page.getByLabel('First name').fill(first);
	await page.getByLabel('Last name').fill(last);
	await page.getByRole('switch', { name: 'Share with household' }).uncheck();
	await page.getByRole('button', { name: 'Add person' }).click();
	await expect(page.getByRole('heading', { name: `${first} ${last}` })).toBeVisible();
	await appReady(page);
}

async function searchFor(page: Page, query: string): Promise<void> {
	await page.goto(`/search?q=${encodeURIComponent(query)}`);
	await expect(page.getByRole('heading', { name: 'Search', exact: true })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('refuses to merge a shared person into a private one, and says why', async ({ page }) => {
	const letters = runLetters();
	const shared = `Leni Fankhauser${letters}`;
	const kept = `Leandra Fankhauser${letters}`;

	await addPerson(page, 'Leni', `Fankhauser${letters}`);
	const sharedUrl = page.url();
	await addPrivatePerson(page, 'Leandra', `Fankhauser${letters}`);

	await recordAction(page, 'Merge someone into this person');
	const form = page.locator('form[action="?/merge"]');
	await pickPerson(form.getByLabel('Who is the same person?'), shared);
	await form.getByRole('button', { name: `Merge into ${kept}` }).click();

	// The step comes back open with its pick, and says why it would not merge.
	const step = page.getByTestId('record-confirm');
	await expect(step).toContainText(`${kept} is private and ${shared} is shared`);
	await expect(step.getByRole('button', { name: `Merge into ${kept}` })).toBeVisible();
	await page.goto(sharedUrl);
	await expect(page.getByRole('heading', { name: shared })).toBeVisible();

	// Positive control: the other way round keeps everything in view, so it merges.
	await appReady(page);
	await recordAction(page, 'Merge someone into this person');
	await pickPerson(form.getByLabel('Who is the same person?'), kept);
	await form.getByRole('button', { name: `Merge into ${shared}` }).click();
	await expect(page.getByTestId('record-confirm')).toHaveCount(0);
	await searchFor(page, kept);
	await expect(page.getByText(`No results for “${kept}”.`)).toBeVisible();
});

test('leaves an archived person’s note out of the search, and finds it once they are back', async ({
	page
}) => {
	const letters = runLetters();
	const word = `heu${letters}`;
	await addPerson(page, 'Rosalind', `Kuenzli${letters}`);

	const notes = page.locator('#section-notes');
	await notes.getByRole('button', { name: 'Add note' }).click();
	await page.getByRole('textbox', { name: 'Note' }).fill(`${word} vom Feld`);
	await notes.getByRole('button', { name: 'Add note' }).click();
	await expect(notes.locator('li', { hasText: word })).toHaveCount(1);
	const personUrl = page.url();
	const hits = (page: Page) => page.getByRole('link', { name: /on Rosalind/ });

	await searchFor(page, word);
	await expect(hits(page)).toHaveCount(1);

	await page.goto(personUrl);
	await appReady(page);
	await recordAction(page, 'Archive');
	await page.getByRole('button', { name: 'Archive this person' }).click();
	await expect(page.getByTestId('archived-marker')).toBeVisible();

	await searchFor(page, word);
	await expect(hits(page)).toHaveCount(0);

	await page.goto(personUrl);
	await appReady(page);
	await recordAction(page, 'Bring back into the lists');
	await page.getByRole('button', { name: 'Bring back into the lists' }).click();
	await expect(page.getByTestId('archived-marker')).toHaveCount(0);

	await searchFor(page, word);
	await expect(hits(page)).toHaveCount(1);
});

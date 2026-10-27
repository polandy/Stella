import { expect, test, type Page } from '@playwright/test';
import { appReady, openPerson, signIn } from './app';

/*
 * The household's linked Nextcloud book (docs/02 §2.16.3): its new cards through the review,
 * a linked person written out, and the card coming back with a fact to add and one that
 * disagrees. Written after the owner tried it on a preview (docs/08 §8.4.1).
 *
 * The e2e server runs with `NEXTCLOUD_DEMO=true`, so the book is the in-memory demo book
 * (`src/lib/server/nextcloud/demo-book.ts`): once Stella has written Markus's card, a "phone"
 * changes it a single time — a home email and a birthday a day off Stella's. The book lives as
 * long as the server, so this is the one spec that answers its review, and it links Markus alone:
 * Thomas and Petra stay out of Stella for the specs that use them as they are. Once answered the
 * review does not come back, so the case runs once per server (no `--repeat-each`). A sync on
 * opening Stella may land between two *Sync now*s, so the case reads where the syncs leave
 * Stella, not the counts of one particular run.
 */

const DRIFT_EMAIL = 'markus@familie-brunner.ch';

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

const panel = (page: Page) => page.getByTestId('nextcloud-panel');

async function syncNow(page: Page): Promise<void> {
	await page.goto('/settings/import');
	await appReady(page);
	await panel(page).getByRole('button', { name: 'Sync now' }).click();
	await expect(panel(page)).toContainText(/Synced: \d+ written to Nextcloud/);
}

test('a linked card comes back: the new email is added, the other birthday waits for an answer', async ({
	page
}) => {
	await syncNow(page);
	await expect(page.getByTestId('nextcloud-new-cards')).toContainText(/new cards? to review/);

	// The review: Markus is the same person; Thomas — a strong match, so answered already — and
	// Petra are skipped.
	await panel(page).getByRole('button', { name: 'Review' }).click();
	const review = page.getByTestId('contact-review');
	await expect(review).toContainText('contacts in the Nextcloud address book.');
	const cardOf = (name: string) => page.getByTestId('review-card').filter({ hasText: name });
	await cardOf('Thomas Widmer').getByRole('button', { name: 'Skip', exact: true }).click();
	await cardOf('Markus Brunner').getByRole('button', { name: 'Same person' }).click();
	await page.getByRole('button', { name: 'Skip the rest' }).click();
	await page.getByRole('button', { name: 'Import 3 answers' }).click();
	await expect(page.getByTestId('import-done')).toContainText('1 completed, 0 new, 2 skipped');

	// Out to the book, then back in with the phone's change.
	await syncNow(page);
	await syncNow(page);

	await openPerson(page, /Markus Brunner/);
	await expect(page.getByText(DRIFT_EMAIL)).toBeVisible();
	// Stella keeps its side until someone answers.
	await expect(page.locator('[data-fact="birthday"]')).toContainText('14 March 1983');

	await page.goto('/settings');
	await appReady(page);
	await expect(page.getByTestId('nextcloud-conflicts-count')).toHaveText('1');
	await page.getByRole('link', { name: /^Nextcloud differences/ }).click();
	const row = page.getByTestId('nextcloud-conflicts').getByRole('listitem').filter({
		hasText: 'Markus Brunner'
	});
	await expect(row).toContainText('Birthday differs');
	await expect(row.getByRole('button', { name: /Keep Stella’s/ })).toContainText('14 March 1983');
	await expect(row.getByRole('button', { name: /Take the card’s/ })).toContainText('15 March 1983');

	await row.getByRole('button', { name: /Keep Stella’s/ }).click();
	await expect(page.getByText('Nothing to answer')).toBeVisible();

	await page.goto('/settings');
	await appReady(page);
	await expect(page.getByTestId('nextcloud-conflicts-count')).toHaveCount(0);
	await openPerson(page, /Markus Brunner/);
	await expect(page.locator('[data-fact="birthday"]')).toContainText('14 March 1983');
});

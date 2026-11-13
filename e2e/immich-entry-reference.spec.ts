import { expect, test, type Page } from '@playwright/test';
import { addPerson, signIn } from './app';

/*
 * Editing a journal entry, a photo from Immich is a reference, not a copy (docs/02 §2.20,
 * docs/04 ADR-132): it shows through the signed proxy, a placeholder stands in when Immich no
 * longer serves it, and its × takes only Stella's reference off. The e2e server runs with
 * `IMMICH_DEMO=true`, whose newest photos are from 1 September 2026 (see immich-library.spec.ts).
 */

const NEWEST_DAY = 'Tuesday, 1 September 2026';

// The page's composer has its own sheet; the editor's is the one open.
const sheet = (page: Page) => page.getByTestId('immich-library').filter({ visible: true });

/** A surname only this case uses. */
const surname = () =>
	`Verweis${Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => String.fromCharCode(97 + (b % 26))).join('')}`;

test('an entry refers to a photo from Immich, shows a placeholder when it is gone, and lets it go', async ({
	page
}) => {
	await signIn(page);
	await addPerson(page, 'Referenza', surname());
	await page.getByRole('link', { name: 'Open journal' }).click();
	await page.getByRole('button', { name: 'Write a moment' }).click();
	await page
		.getByRole('textbox', { name: 'Moment', exact: true })
		.fill('a walk, photo kept in Immich');
	await page.getByRole('button', { name: 'Save moment' }).click();
	const entry = page.locator('article', { hasText: 'a walk, photo kept in Immich' });
	await expect(entry).toBeVisible();

	await entry.getByRole('button', { name: 'Edit moment' }).click();
	const editor = page.getByTestId('journal-entry-editor');
	await editor.getByRole('button', { name: 'Add photos' }).click();
	await page.getByRole('menuitem', { name: 'From Immich' }).click();
	await sheet(page).getByRole('button', { name: 'An earlier day with photos' }).click();
	await expect(sheet(page).getByTestId('immich-library-day')).toContainText(NEWEST_DAY);
	await sheet(page).getByTestId('immich-library-photos').getByRole('button').first().click();
	await sheet(page).getByRole('button', { name: 'Add 1 photo', exact: true }).click();
	await expect(sheet(page)).toBeHidden();
	await expect(editor.getByTestId('editor-immich-pick')).toHaveCount(1);
	await editor.getByRole('button', { name: 'Save changes' }).click();

	// Shown through the signed proxy, not copied into Stella's media.
	const photo = entry.locator('img[src^="/media/immich/"]');
	await expect(photo).toHaveCount(1);
	await expect(entry.locator('img[src^="/media/"]:not([src^="/media/immich/"])')).toHaveCount(0);

	// The person's story shows it too.
	const journalUrl = page.url();
	await page.goto(journalUrl.replace(/\/journal.*$/, ''));
	await expect(
		page
			.locator('#section-story [data-story-item]')
			.filter({ hasText: 'a walk, photo kept in Immich' })
			.locator('img[src^="/media/immich/"]')
	).toHaveCount(1);
	await page.goto(journalUrl);

	// Immich no longer has it (the proxy answers 404): a placeholder, never a broken image.
	await page.route('**/media/immich/**', (route) => route.fulfill({ status: 404 }));
	await page.reload();
	await expect(entry.getByTestId('immich-photo-unavailable')).toHaveAccessibleName(
		'Photo not available from Immich'
	);
	await page.unroute('**/media/immich/**');

	await entry.getByRole('button', { name: 'Edit moment' }).click();
	await editor.getByRole('button', { name: 'Remove photo 1 of 1' }).click();
	await editor.getByRole('button', { name: 'Save changes' }).click();
	await expect(editor).toBeHidden();
	await expect(entry.locator('img')).toHaveCount(0);
	await expect(entry.getByTestId('immich-photo-unavailable')).toHaveCount(0);
});

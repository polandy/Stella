import { expect, test } from '@playwright/test';
// Node runs the specs, so the JSON import needs its attribute and has only a default
// export; Vite compiles the app's own `src/lib/version.ts`, where neither is true.
import packageJson from '../package.json' with { type: 'json' };
import { STUB_RELEASE_TAG, STUB_RELEASE_URL } from './release-feed';

/*
 * The About card, and the notice that a newer release exists (docs/02 §2.17.1). Written
 * after the card was seen in the running app (docs/08 §8.4.1).
 *
 * The suite's server runs with the check on, pointed at `release-feed-stub.ts` rather than
 * at GitHub — so the answer is a fixed version instead of whatever is published today, and
 * the run needs no network. `version` below is what the build reports, which is the same
 * `package.json` the app reads.
 */

/** The version the running build reports — the same `package.json` field the app reads. */
const RUNNING_VERSION = packageJson.version;

test.describe('Settings → About', () => {
	test('names the version this instance is running', async ({ page }) => {
		await page.goto('/settings');

		await expect(page.getByRole('heading', { name: 'About' })).toBeVisible();
		await expect(page.getByText(`Stella ${RUNNING_VERSION}`, { exact: true })).toBeVisible();
	});

	test('says a newer release is out, and links to what changed', async ({ page }) => {
		await page.goto('/settings');

		const notice = page.getByText(`${STUB_RELEASE_TAG} is available`);
		await expect(notice).toBeVisible();
		await expect(page.getByText('New', { exact: true })).toBeVisible();

		const link = page.getByRole('link', { name: 'Release notes' });
		await expect(link).toHaveAttribute('href', STUB_RELEASE_URL);
		// The link leaves the app, so it must not hand the opened page a handle back to it.
		await expect(link).toHaveAttribute('rel', /noopener/);
	});

	test('does not claim the instance is current while it is behind', async ({ page }) => {
		await page.goto('/settings');

		// The positive signal for this absence is the notice above, asserted in the same
		// card: the two sentences are mutually exclusive branches of one `{#if}`, so a card
		// showing neither would fail there rather than passing quietly here.
		await expect(page.getByText(`${STUB_RELEASE_TAG} is available`)).toBeVisible();
		await expect(page.getByText('This is the newest release.')).toBeHidden();
	});

	test('reads the same card in German', async ({ page }) => {
		await page.goto('/settings');
		await page.locator('button[name="locale"][value="de"]').click();

		await expect(page.getByRole('heading', { name: 'Über Stella' })).toBeVisible();
		await expect(page.getByText(`${STUB_RELEASE_TAG} ist verfügbar`)).toBeVisible();
		// Upper case in the card is `text-transform`, so the text itself is still "Neu".
		await expect(page.getByText('Neu', { exact: true })).toBeVisible();

		// Every other spec starts from English, and the language is stored on the profile.
		await page.locator('button[name="locale"][value="en"]').click();
		await expect(page.getByRole('heading', { name: 'About' })).toBeVisible();
	});
});

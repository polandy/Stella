import { expect, test } from '@playwright/test';
import { openPerson, signIn } from './app';

/*
 * Out of a person's page into the household's graph, and back again (docs/02 §2.7,
 * docs/05 §5.5). The map on a profile reaches two hops; this is the way past it, and the way
 * home from it. Written after the maintainer walked it in the running app (docs/08 §8.4.1).
 */

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('carries the person into the graph and offers the way back to their page', async ({
	page
}) => {
	await openPerson(page, /Lena Brunner/);
	const id = new URL(page.url()).pathname.split('/').pop()!;

	await page
		.locator('#section-relationships')
		.getByRole('link', { name: 'Open in the graph' })
		.click();

	// She is the centre, which is what the link carried — the peek panel opens on her.
	await expect(page).toHaveURL(`/graph?center=${id}`);
	await expect(page.locator('canvas').first()).toBeVisible();
	await expect(page.getByRole('complementary').getByText('Lena Brunner')).toBeVisible();

	// And the graph knows where the reader came from.
	await page.getByRole('link', { name: 'Back to Lena Brunner' }).click();
	await expect(page).toHaveURL(`/contacts/${id}`);
	await expect(page.getByRole('heading', { level: 1, name: 'Lena Brunner' })).toBeVisible();
});

test('a graph opened on its own owes no way back', async ({ page }) => {
	await page.goto('/graph');
	await expect(page.locator('canvas').first()).toBeVisible();

	// The explorer fell back to a centre nobody asked for, so there is no page to return to —
	// the hint is there in its place, which is what says the bar itself rendered.
	await expect(page.getByRole('link', { name: /^Back to/ })).toHaveCount(0);
	await expect(page.getByText('Click to focus · click again to expand')).toBeVisible();
});

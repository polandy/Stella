import { expect, test, type Page } from '@playwright/test';
import { signIn } from './app';

/*
 * Out of a circle's page into the household's graph, and back again (docs/02 §2.7,
 * docs/05 §5.5, §5.8). A circle is a node of the graph like a person is, so it can be the
 * centre: this is the way there, the way home, and the way a circle node offers back to its
 * own page. Written after the maintainer walked it in the running app (docs/08 §8.4.1).
 *
 * Read-only against the demo household — it opens pages and follows links, and leaves the
 * seed as it found it.
 */

/** A seeded circle with several members, so the map around it is worth drawing. */
const CIRCLE = 'Turnverein Länggasse';

/** Opens the circle's page through the app's own links, and answers with its id. */
async function openCircle(page: Page): Promise<string> {
	await page.goto('/circles');
	await page.getByTestId('circle-cards').getByRole('link', { name: CIRCLE }).click();
	await expect(page.getByRole('heading', { level: 1, name: CIRCLE })).toBeVisible();
	return new URL(page.url()).pathname.split('/').pop()!;
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('carries a circle into the graph and offers the way back to its page', async ({ page }) => {
	const id = await openCircle(page);

	await page.getByRole('link', { name: 'Open in the graph' }).click();

	// The circle is the centre, which is what the link carried. The route opens with its
	// centre selected, so the panel is the canvas saying which node it was handed.
	await expect(page).toHaveURL(`/graph?center=${id}`);
	await expect(page.locator('canvas').first()).toBeVisible();
	const peek = page.getByRole('complementary');
	await expect(peek.getByText(CIRCLE)).toBeVisible();
	await expect(peek.getByText('Shared context')).toBeVisible();

	// And the graph knows it came from a circle: back to /circles, not to a person's profile.
	await page.getByRole('link', { name: `Back to the ${CIRCLE} circle` }).click();
	await expect(page).toHaveURL(`/circles/${id}`);
	await expect(page.getByRole('heading', { level: 1, name: CIRCLE })).toBeVisible();
});

test('a circle node’s panel leads to the circle’s own page', async ({ page }) => {
	const id = await openCircle(page);
	await page.getByRole('link', { name: 'Open in the graph' }).click();
	await expect(page.locator('canvas').first()).toBeVisible();

	// The counterpart of "Open profile" on a person node — the exit a circle node owns.
	await page.getByRole('complementary').getByRole('link', { name: 'Open the circle' }).click();
	await expect(page).toHaveURL(`/circles/${id}`);
	await expect(page.getByRole('heading', { level: 1, name: CIRCLE })).toBeVisible();
});

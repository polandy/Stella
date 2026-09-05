import { expect, test, type Page } from '@playwright/test';

/*
 * The explorer's toolbar and peek panel (docs/05 §5.8). Written after the screen was seen in
 * the running app (docs/08 §8.4.1). What the canvas draws is held by `theme.test.ts` and
 * `elements.test.ts`; this covers what surrounds it.
 */

/** Signs in through the SEED_DEMO one-click button and lands on Home. */
async function signIn(page: Page): Promise<void> {
	await page.goto('/login');
	await page.getByRole('button', { name: 'Sign in as demo user' }).click();
	await expect(page.getByRole('heading', { name: 'What happened?' })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('the filter chips are the legend, and there is no second one', async ({ page }) => {
	await page.goto('/graph?center=demo-c-hans');
	await expect(page.locator('canvas').first()).toBeVisible();

	for (const label of ['Family', 'Romantic', 'Social', 'Work', 'Circles', 'Kinship']) {
		await expect(page.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'true');
	}
	await expect(page.getByText('Connections', { exact: true })).toHaveCount(0);

	await page.getByRole('button', { name: 'Family' }).click();
	await expect(page.getByRole('button', { name: 'Family' })).toHaveAttribute('aria-pressed', 'false');
});

test('opens the peek panel on the centred person with their face, name and a way to their page', async ({ page }) => {
	await page.goto('/graph?center=demo-c-hans');
	const canvas = page.locator('canvas').first();
	await expect(canvas).toBeVisible();

	// The centre node sits in the middle of the canvas once the layout has settled.
	await expect(async () => {
		const box = await canvas.boundingBox();
		if (!box) throw new Error('no canvas');
		await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
		await expect(page.getByRole('complementary').getByText('Hans Brunner')).toBeVisible({ timeout: 800 });
	}).toPass();

	const peek = page.getByRole('complementary');
	await expect(peek.getByText('HB')).toBeVisible();
	await expect(peek.getByRole('button', { name: 'Close' })).toBeVisible();
	await peek.getByRole('link', { name: 'Open profile' }).click();
	await expect(page).toHaveURL(/\/contacts\/demo-c-hans$/);
});

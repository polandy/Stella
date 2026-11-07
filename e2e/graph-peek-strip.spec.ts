import { expect, test, type Page } from '@playwright/test';
import { signIn } from './app';

/*
 * Where the graph's peek panel sits (docs/05 §5.8): the bottom strip below `lg` (1024px) — a
 * tablet included, which a side panel would rob of a third of the map — and beside the map from
 * there up. Written after the owner tried it (docs/08 §8.4.1). Read-only against the demo
 * household.
 */

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

async function openPeek(page: Page) {
	await page.goto('/graph?center=demo-c-hans');
	await expect(page.locator('canvas').first()).toBeVisible();
	// The panel of the person, not the other aside the explorer carries (the legend).
	const peek = page
		.getByRole('complementary')
		.filter({ has: page.getByRole('link', { name: 'Open profile' }) });
	await expect(peek.getByText('Hans Brunner')).toBeVisible();
	return peek;
}

test.describe('on a tablet (820px)', () => {
	test.use({ viewport: { width: 820, height: 1180 } });

	test('the peek is a strip along the map’s foot, not a side panel', async ({ page }) => {
		const peek = await openPeek(page);
		const box = (await peek.boundingBox())!;
		const canvas = (await page.locator('canvas').first().boundingBox())!;

		// Nearly the map's width, and under its half-way point: a strip, not a column.
		expect(box.width).toBeGreaterThan(canvas.width * 0.9);
		expect(box.y).toBeGreaterThan(canvas.y + canvas.height / 2);
		expect(box.y + box.height).toBeLessThanOrEqual(canvas.y + canvas.height);
	});
});

test.describe('on a desktop (1280px)', () => {
	test.use({ viewport: { width: 1280, height: 800 } });

	test('the peek stays a panel beside the map', async ({ page }) => {
		const peek = await openPeek(page);
		const box = (await peek.boundingBox())!;
		const canvas = (await page.locator('canvas').first().boundingBox())!;

		expect(box.width).toBeLessThan(400);
		expect(box.x + box.width).toBeGreaterThan(canvas.x + canvas.width * 0.8);
		expect(box.y).toBeLessThan(canvas.y + canvas.height / 4);
	});
});

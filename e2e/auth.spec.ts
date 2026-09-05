import { expect, test } from '@playwright/test';

/*
 * The split sign-in shell (docs/05 §5.5). Written after the screen was seen in the running
 * app (docs/08 §8.4.1). The demo login itself is exercised by every other spec.
 */

test('shows the brand beside the form on a wide screen', async ({ page }) => {
	await page.goto('/login');
	await expect(page.getByText('The people in your life, remembered — together.')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test.describe('on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test('puts the form first and keeps the brand to a header', async ({ page }) => {
		await page.goto('/login');
		await expect(page.getByText('The people in your life, remembered — together.')).toBeHidden();
		await expect(page.getByRole('heading', { name: 'Sign in' })).toBeInViewport();
		await expect(page.getByLabel('Email')).toBeInViewport();
	});
});

import { expect, test } from '@playwright/test';
import { signIn } from './app';

/*
 * The sign-in switches hold at the edge while SSO is off, the e2e default (docs/04 §4.4): the
 * callback answers 404 instead of exchanging anything, and a member who follows a crafted
 * callback link keeps their session. Written after the owner's OK (docs/08 §8.4.1). There is
 * no IdP in the e2e stack, so the sealed transaction cookie is covered by the unit tests.
 */

const CRAFTED_CALLBACK = '/login/sso/callback?code=planted&state=planted';

test.describe('a visitor', () => {
	test.use({ storageState: { cookies: [], origins: [] } });

	test('gets a 404 from the callback and no SSO entry on the sign-in page', async ({ page }) => {
		const response = await page.goto(CRAFTED_CALLBACK);
		expect(response?.status()).toBe(404);

		await page.goto('/login/sso');
		await expect(page).toHaveURL(/\/login$/);
		await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
		await expect(page.locator('a[href="/login/sso"]')).toHaveCount(0);
	});
});

test('a member who follows a crafted callback link stays signed in', async ({ page }) => {
	await signIn(page);

	const response = await page.goto(CRAFTED_CALLBACK);
	expect(response?.status()).toBe(404);

	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'What happened?' })).toBeVisible();
});

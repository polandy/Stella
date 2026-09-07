import { expect, test as setup } from '@playwright/test';
import { AUTH_STATE_PATH } from './auth-state';

/*
 * Signs in once and stores the session, so the 80-odd specs that follow open the app already
 * signed in instead of each driving the login form. The sign-in screen itself is covered by
 * `auth.spec.ts`, which opts back out of this state.
 */
setup('signs in as the demo user for the rest of the suite', async ({ page }) => {
	await page.goto('/login');
	await page.getByRole('button', { name: 'Sign in as demo user' }).click();
	await expect(page.getByRole('heading', { name: 'What happened?' })).toBeVisible();
	await page.context().storageState({ path: AUTH_STATE_PATH });
});

import { expect, test, type Page } from '@playwright/test';
import { appReady, signIn } from './app';
import { STUB_IDENTITIES, type StubIdentityKey } from './oidc';

// The SSO sign-in (docs/dev/02 §2.1.2) against `oidc-stub.ts`; SSO off is unit-covered.

async function signInWithSso(page: Page, who: StubIdentityKey): Promise<void> {
	await page.goto('/login');
	await page.getByRole('link', { name: 'Sign in with SSO' }).click();
	await expect(page.getByRole('heading', { name: 'Sign in as' })).toBeVisible();
	await page.getByRole('link', { name: STUB_IDENTITIES[who].name }).click();
}

test.describe('a visitor', () => {
	test.use({ storageState: { cookies: [], origins: [] } });

	test('signs in through the provider as the member their email links to', async ({ page }) => {
		await signInWithSso(page, 'nina');
		await expect(page.getByRole('heading', { name: 'What happened?' })).toBeVisible();
		await appReady(page);

		// Nina is a member, not the demo admin, so an admin page refuses the account.
		const response = await page.goto('/settings/import');
		expect(response?.status()).toBe(403);
		await expect(page.getByText('Only an admin can do this.')).toBeVisible();
	});

	test('outside the allowed groups is turned away with the reason', async ({ page }) => {
		await signInWithSso(page, 'outsider');
		await expect(page).toHaveURL(/\/login\?error=/);
		await expect(page.getByText('Your account is not permitted to sign in here.')).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
	});
});

test('a member who goes through the provider again keeps their own session', async ({ page }) => {
	await signIn(page);

	await page.goto('/login/sso');
	await page.getByRole('link', { name: STUB_IDENTITIES.nina.name }).click();
	await expect(page.getByRole('heading', { name: 'What happened?' })).toBeVisible();

	// Still the demo admin, not Nina: the callback never swaps a session that is already there.
	const response = await page.goto('/settings/import');
	expect(response?.status()).toBe(200);
	await expect(page.getByRole('heading', { name: 'Import people' })).toBeVisible();
});

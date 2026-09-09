import { expect, test, type Page } from '@playwright/test';

/*
 * Signing out (docs/02 §2.1). Written after the flow was verified in the running app against
 * Authelia (docs/08 §8.4.1).
 *
 * Sign-out revokes the session on the server, and the rest of the suite runs on one shared
 * session — so this spec opts out of it and signs in for itself. Revoking its own session
 * leaves the shared one alone.
 *
 * Two limits of this layer, both deliberate:
 *
 * The provider round-trip is not covered and cannot be — Authelia 4.39 exposes no end-session
 * endpoint, so the sign-out driven here is the local path, which is the one the household
 * actually gets and the one that must never fail.
 *
 * Nor can a browser tell a revoked session from a cleared cookie: it only ever holds the
 * cookie. Mutation-checked — leaving the session row in place while still clearing the cookie
 * keeps every case here green. That the row is really deleted is `signOut`'s promise and is
 * covered where it can be seen, in `session.test.ts`.
 */

test.use({ storageState: { cookies: [], origins: [] } });

async function signInAsDemo(page: Page): Promise<void> {
	await page.goto('/login');
	await page.getByRole('button', { name: 'Sign in as demo user' }).click();
	await expect(page.getByRole('heading', { name: 'What happened?' })).toBeVisible();
}

async function signOut(page: Page): Promise<void> {
	// Scoped to the account menu rather than matching the name page-wide: the stream renders
	// author names too, and only writes the signed-in user, so a page-wide match would depend
	// on that detail rather than on anything this spec is about.
	const accountMenu = page.locator('details', { hasText: 'Sign out' });
	await accountMenu.locator('summary').click();
	await accountMenu.getByRole('button', { name: 'Sign out' }).click();
}

test('signing out returns to the sign-in page and locks the app behind it', async ({ page }) => {
	await signInAsDemo(page);

	// The positive control for the assertion at the end: while signed in, a page behind the
	// guard opens. Without this, "redirected to /login" would also pass against a build where
	// signing in never worked.
	await page.goto('/contacts');
	await expect(page.getByRole('heading', { name: 'People' })).toBeVisible();

	await page.goto('/');
	await signOut(page);

	await expect(page).toHaveURL(/\/login\?signedOut=1$/);
	await expect(page.getByText('You have been signed out.')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

	// Not merely "we landed on the login page": the app is out of reach afterwards, even when
	// a guarded page is asked for directly.
	await page.goto('/contacts');
	await expect(page).toHaveURL(/\/login/);
	await expect(page.getByRole('heading', { name: 'People' })).toBeHidden();
});

test('signing in again after signing out works', async ({ page }) => {
	await signInAsDemo(page);
	await page.goto('/');
	await signOut(page);
	await expect(page).toHaveURL(/\/login\?signedOut=1$/);

	// Sign-out must not leave anything behind that blocks the next sign-in — the stale cookie
	// is cleared, not just the row it pointed at.
	await signInAsDemo(page);
	await expect(page).toHaveURL(/\/$/);
});

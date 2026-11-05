import { expect, test } from '@playwright/test';

/*
 * The security baseline a browser actually receives (docs/04 §4.7): the page's
 * Content-Security-Policy, and a setup form that stays shut once a household exists.
 * Written after the owner's hand test (docs/08 §8.4.1).
 */

// A visitor, not the suite's signed-in member: both checks are about what a stranger meets.
test.use({ storageState: { cookies: [], origins: [] } });

test('a page runs only scripts carrying its own nonce, and forms post only home', async ({
	page
}) => {
	const response = await page.goto('/login');
	const csp = response?.headers()['content-security-policy'] ?? '';

	const nonce = /script-src 'self' 'nonce-([^']+)'/.exec(csp)?.[1];
	expect(nonce, csp).toBeTruthy();
	expect(csp).toContain("frame-ancestors 'none'");
	expect(csp).toContain("object-src 'none'");
	// The demo instance runs without SSO, so sign-out hands over to no identity provider.
	expect(csp).toMatch(/form-action 'self'$/);

	// Every inline script on the page is the one the policy lets run.
	const scripts = page.locator('script:not([src])');
	expect(await scripts.count()).toBeGreaterThan(0);
	for (const script of await scripts.all()) {
		expect(await script.evaluate((el: HTMLScriptElement) => el.nonce)).toBe(nonce);
	}
});

test('setup refuses an overlong password, and a second household outright', async ({ page }) => {
	await page.goto('/login');
	const origin = new URL(page.url()).origin;
	// The form itself is gone once someone has signed up, and a re-rendered page would redirect
	// to sign-in, so the action is asked directly and answers in its JSON form.
	const setup = async (password: string) => {
		const response = await page.request.post('/setup', {
			form: { householdName: 'Intruders', name: 'Mallory', email: 'm@example.test', password },
			headers: { origin }
		});
		return (await response.json()) as { type: string; status: number; data: string };
	};

	const overlong = await setup('x'.repeat(129));
	expect(overlong).toMatchObject({ type: 'failure', status: 400 });
	expect(overlong.data).toContain('Use at most 128 characters.');

	const second = await setup('a-good-password');
	expect(second).toMatchObject({ type: 'failure', status: 409 });
	expect(second.data).toContain('Setup has already been completed.');
});

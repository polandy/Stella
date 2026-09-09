import { expect, test, type Page } from '@playwright/test';
import { LOCALE_COOKIE } from '../src/lib/i18n/locales';
import { AUTH_STATE_PATH } from './auth-state';
import { signIn } from './app';

/*
 * Choosing the interface language (docs/02 §2.19). Written after the maintainer saw the
 * screens in the running app (docs/08 §8.4.1).
 *
 * The rest of the suite asserts English strings and shares one database with this file, so
 * every case here either runs in a throwaway signed-out context or hands the demo account
 * back in English — see the `afterEach` below.
 */

/** Clicks one language in the picker and waits for the answer to come back rendered. */
async function chooseLanguage(page: Page, language: string, settled: RegExp): Promise<void> {
	await page.getByRole('button', { name: language }).click();
	await expect(page.getByRole('heading', { name: settled })).toBeVisible();
}

test.describe('signed in', () => {
	// The choice is stored in the profile, so it outlives this case's browser context and
	// would otherwise reach every spec that runs after this file.
	test.afterEach(async ({ page }) => {
		await page.goto('/settings');
		await chooseLanguage(page, 'English', /^Settings$/);
	});

	test('switches the whole interface to German and keeps it in the profile', async ({
		page,
		browser,
		baseURL
	}) => {
		await signIn(page);
		await page.goto('/settings');
		await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

		await chooseLanguage(page, 'Deutsch', /^Einstellungen$/);

		// The picker says which language is on, and the document says it to a screen reader.
		await expect(page.getByRole('button', { name: 'Deutsch' })).toHaveAttribute(
			'aria-current',
			'true'
		);
		await expect(page.getByRole('button', { name: 'English' })).not.toHaveAttribute(
			'aria-current',
			'true'
		);
		await expect(page.locator('html')).toHaveAttribute('lang', 'de');

		// Not only the page that carried the picker: the shell and Home speak German too.
		await page.goto('/');
		await expect(page.getByRole('heading', { name: 'Was ist passiert?' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Menschen' }).first()).toBeVisible();

		// The lasting record is the profile, not this browser: a session that has never seen
		// the locale cookie still opens in German.
		const elsewhere = await browser.newContext({ storageState: AUTH_STATE_PATH, baseURL });
		await elsewhere.clearCookies({ name: LOCALE_COOKIE });
		const otherDevice = await elsewhere.newPage();
		await otherDevice.goto('/');
		await expect(otherDevice.getByRole('heading', { name: 'Was ist passiert?' })).toBeVisible();
		await elsewhere.close();

		// And it outranks a cookie that disagrees — the browser's guess never overrules a
		// choice somebody made.
		await page.context().addCookies([{ name: LOCALE_COOKIE, value: 'en', url: baseURL! }]);
		await page.goto('/');
		await expect(page.getByRole('heading', { name: 'Was ist passiert?' })).toBeVisible();
	});

	test('refuses a language Stella does not speak, and changes nothing', async ({
		page,
		baseURL
	}) => {
		await signIn(page);

		// Posted straight at the route: the picker only ever offers the two it supports, so
		// this is the guard against a hand-made form (`routes/locale/+server.ts`).
		const response = await page.request.post('/locale', {
			form: { locale: 'fr', redirectTo: '/settings' },
			headers: { origin: baseURL! }
		});
		expect(response.status()).toBe(400);

		// The positive control: the same navigation still renders, and still in English.
		await page.goto('/settings');
		await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
	});
});

test.describe('before signing in', () => {
	test.use({ storageState: { cookies: [], origins: [] } });

	test('lets a visitor read the sign-in screen in German, with no account to remember it', async ({
		page
	}) => {
		await page.goto('/login');
		await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

		await chooseLanguage(page, 'Deutsch', /^Anmelden$/);

		await expect(page.locator('html')).toHaveAttribute('lang', 'de');
		// The cookie carries the choice on to the next page seen while signed out.
		await page.goto('/login');
		await expect(page.getByRole('heading', { name: 'Anmelden' })).toBeVisible();
	});

	test.describe('on a German browser', () => {
		test.use({ locale: 'de-DE' });

		test('greets a visitor in German before anyone has chosen', async ({ page }) => {
			await page.goto('/login');
			await expect(page.getByRole('heading', { name: 'Anmelden' })).toBeVisible();
			await expect(page.locator('html')).toHaveAttribute('lang', 'de');
		});
	});

	test.describe('on an English browser', () => {
		test.use({ locale: 'en-GB' });

		test('greets a visitor in English before anyone has chosen', async ({ page }) => {
			await page.goto('/login');
			await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
			await expect(page.locator('html')).toHaveAttribute('lang', 'en');
		});
	});
});

import { expect, test, type Browser, type BrowserContext } from '@playwright/test';
import { DEMO_ADMIN_PASSWORD, DEMO_MEMBER_EMAIL } from '../src/lib/server/db/demo-seed';
import { appReady, signIn } from './app';
import { personIdOf, seedHousehold } from './seed';

/*
 * The admin-only pages (docs/02 §2.16 import, §2.17 "Data") refuse a member who opens them by
 * hand with a 403 in the member's own language, and still open for the admin (docs/04 §4.4).
 * Deleting and merging a person is the admin's alone too (docs/03 §3.7): a member is offered
 * neither, and a hand-made post of either is refused.
 * Written after the owner checked it in the running app (docs/08 §8.4.1). Nina's profile names
 * no language, so a browser that asks for German is answered in German — no account is changed.
 */

const ADMIN_PAGES = ['/settings/relationship-types', '/settings/import'];

/** A browser signed in as the household's other member, Nina, in English. */
async function signInAsNina(browser: Browser): Promise<BrowserContext> {
	const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
	const page = await context.newPage();
	await page.goto('/login');
	await page.getByLabel('Email').fill(DEMO_MEMBER_EMAIL);
	await page.getByLabel('Password').fill(DEMO_ADMIN_PASSWORD);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'What happened?' })).toBeVisible();
	await appReady(page);
	await page.close();
	return context;
}

test('a member who opens an admin page is refused in their language', async ({ browser }) => {
	const english = await signInAsNina(browser);
	const german = await browser.newContext({
		storageState: await english.storageState(),
		locale: 'de-DE'
	});
	for (const [context, refusal] of [
		[english, 'Only an admin can do this.'],
		[german, 'Das kann nur die Haushalts-Administration.']
	] as const) {
		const page = await context.newPage();
		for (const path of ADMIN_PAGES) {
			const response = await page.goto(path);
			expect(response?.status()).toBe(403);
			await expect(page.getByText(refusal)).toBeVisible();
		}
		await context.close();
	}
});

test('the admin still opens the admin pages', async ({ page }) => {
	await signIn(page);
	await page.goto('/settings/relationship-types');
	await expect(page.getByRole('heading', { name: 'Relationship types', level: 1 })).toBeVisible();
	await page.goto('/settings/import');
	await expect(page.getByRole('heading', { name: 'Import people' })).toBeVisible();
});

test('a member is offered neither delete nor merge, and a hand-made one is refused', async ({
	page,
	browser
}) => {
	const who = 'Balz Waefler';
	const twin = 'Balz Waefler-Moser';
	await signIn(page);
	await seedHousehold(page, [who, twin]);
	const personUrl = `/contacts/${personIdOf(who)}`;

	const nina = await signInAsNina(browser);
	const ninaPage = await nina.newPage();
	await ninaPage.goto(personUrl);
	await expect(ninaPage.getByRole('heading', { name: who })).toBeVisible();
	await appReady(ninaPage);
	await ninaPage.getByRole('button', { name: 'More actions' }).click();
	// Positive control: the menu is open and offers what a member may do.
	await expect(ninaPage.getByRole('menuitem', { name: 'Archive', exact: true })).toBeVisible();
	await expect(ninaPage.getByRole('menuitem', { name: 'Delete for good' })).toHaveCount(0);
	await expect(
		ninaPage.getByRole('menuitem', { name: 'Merge someone into this person' })
	).toHaveCount(0);

	const headers = { origin: new URL(ninaPage.url()).origin, accept: 'text/html' };
	const deleted = await ninaPage.request.post(`${personUrl}?/delete`, { form: {}, headers });
	expect(deleted.status()).toBe(403);
	const merged = await ninaPage.request.post(`${personUrl}?/merge`, {
		form: { mergedId: personIdOf(twin) },
		headers
	});
	expect(merged.status()).toBe(403);
	await nina.close();

	// Both are still here for the admin.
	for (const name of [who, twin]) {
		await page.goto(`/contacts/${personIdOf(name)}`);
		await expect(page.getByRole('heading', { name })).toBeVisible();
	}
});

import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { NETWORK_PATIENCE_MS } from '../src/lib/pwa/cache-policy';
import { COMMAND_PATIENCE_MS } from '../src/lib/pwa/outbox';
import { signIn } from './app';

/*
 * Reading and adding while Stella is out of reach, with the service worker running (docs/02
 * §2.18). The only specs that let it run: they belong to the `pwa` project, which allows it,
 * while the rest of the suite blocks it (`playwright.config.ts`). Written after the flow was
 * verified on a phone (docs/08 §8.4.1).
 *
 * Out of reach comes in two shapes. `context.setOffline` fails every request at once; a phone
 * in flight mode behind a VPN instead sends the request and never hears back, which is the
 * shape that hung the app on 0.0.19-rc.1 and that `neverAnswer` reproduces.
 *
 * Stillo Funkloch is invented here and in no seed; kept on the device, never sent.
 */

/** Waits until the service worker controls the page, so its fetches go through the worker. */
async function underWorker(page: Page): Promise<void> {
	await page.evaluate(async () => {
		await navigator.serviceWorker.ready;
		if (navigator.serviceWorker.controller) return;
		await new Promise((resolve) =>
			navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true })
		);
	});
}

/** Whether the worker's cache holds a page, which is what makes it readable offline. */
function isKept(page: Page, path: string): Promise<boolean> {
	return page.evaluate(async (wanted) => {
		for (const name of await caches.keys()) {
			if (await (await caches.open(name)).match(wanted)) return true;
		}
		return false;
	}, path);
}

/** A network that takes every request and answers none — the phone in flight mode. */
async function neverAnswer(context: BrowserContext): Promise<void> {
	await context.route('**/*', () => {});
}

/** The phone's People tab — the sidebar link of the same name is hidden at this width. */
const peopleTab = (page: Page) => page.locator('a[href="/contacts"]:visible').first();

/** Opens Lena Brunner's page the way a phone does: by tapping, never from the address bar. */
async function tapToLena(page: Page): Promise<void> {
	await peopleTab(page).click();
	await page.getByRole('link', { name: /Lena Brunner/ }).first().click();
	await expect(page.getByRole('heading', { name: 'Lena Brunner' })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
	await underWorker(page);
});

test('opens Settings offline without it ever having been read', async ({ page, context }) => {
	// The worker keeps it when it takes over; the cache holding it is the signal, not a wait.
	await expect.poll(() => isKept(page, '/settings')).toBe(true);
	await context.setOffline(true);

	await page.getByRole('link', { name: 'Settings' }).first().click();
	await expect(page.getByRole('heading', { name: 'Language' })).toBeVisible();
});

test('opens People and Circles offline without them ever having been read, and says how old they are', async ({
	page,
	context
}) => {
	// Kept as the worker takes over, in order, so Circles being there means People is too.
	await expect.poll(() => isKept(page, '/circles')).toBe(true);
	await context.setOffline(true);

	await page.locator('a[href="/circles"]:visible').first().click();
	await expect(page.getByRole('heading', { name: 'Circles', level: 1 })).toBeVisible();
	// The exact wording (today, yesterday, a date) is `copy-age.test.ts`'s; here, that it is said.
	await expect(page.getByTestId('offline-banner')).toHaveText(/from this device, as of .*\d{2}:\d{2}/);

	await peopleTab(page).click();
	await expect(page.getByRole('heading', { name: 'People', level: 1 })).toBeVisible();
});

test('opens a page offline that was only ever reached by tapping', async ({ page, context }) => {
	await tapToLena(page);
	await page.getByRole('link', { name: 'Home' }).first().click();
	await expect(page.getByRole('heading', { name: 'What happened?' })).toBeVisible();
	await context.setOffline(true);

	await tapToLena(page);
});

test('finds a person from Home offline and opens them', async ({ page, context }) => {
	// The search reads the people the shell already carries (docs/02 §2.22.1); the page it
	// opens comes from the worker's cache, which the tap to Lena has filled.
	await tapToLena(page);
	await page.getByRole('link', { name: 'Home' }).first().click();
	await context.setOffline(true);

	await page.getByRole('combobox', { name: 'Find a person…' }).pressSequentially('lena');
	await page.getByRole('option', { name: 'Lena Brunner' }).click();
	await expect(page.getByRole('heading', { name: 'Lena Brunner' })).toBeVisible();
});

test('answers from the device when requests are never answered, and keeps a new person', async ({
	page,
	context
}) => {
	await tapToLena(page);
	await page.goto('/contacts/new');
	await expect(page.getByLabel('First name')).toBeVisible();
	await neverAnswer(context);

	// The first save waits its full patience for an answer, then keeps the person.
	await page.getByLabel('First name').fill('Stillo');
	await page.getByLabel('Last name').fill('Funkloch');
	await page.getByRole('button', { name: 'Add person' }).last().click();
	await expect(
		page.getByRole('status').filter({ hasText: 'Stillo Funkloch is kept on this device' })
	).toBeVisible({ timeout: COMMAND_PATIENCE_MS + 5_000 });

	// A page with a copy opens once the network has had its patience, not on its silence:
	// without the limit, this tap waits forever and the test times out.
	test.setTimeout(COMMAND_PATIENCE_MS + 4 * NETWORK_PATIENCE_MS + 10_000);
	await tapToLena(page);
});

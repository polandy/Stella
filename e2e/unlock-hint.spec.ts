import { expect, test, type Page } from '@playwright/test';
import { addPerson, appReady, signIn } from './app';

/*
 * The device-unlock hint on Home (docs/dev/02 §2.10.1): it shows once the member has a private
 * entry, on a device that can do it, and its answers stay on the device. The device is a
 * virtual authenticator, added before Home loads because the browser is asked once at load.
 * Written after the flow was verified in the running app (docs/dev/08 §8.4.1).
 */

// A passkey's relying party cannot be an IP address, so the browser reaches the app as
// `localhost`; the server is configured for 127.0.0.1, so each request is relayed there.
const PORT = process.env.E2E_PORT ?? '4173';
const SERVER = `http://127.0.0.1:${PORT}`;
test.use({ baseURL: `http://localhost:${PORT}` });

async function relayToServer(page: Page) {
	await page.route(`http://localhost:${PORT}/**`, async (route) => {
		const request = route.request();
		const headers = { ...request.headers() };
		if (headers.origin) headers.origin = SERVER;
		await route.fulfill({
			response: await route.fetch({
				url: request.url().replace(`http://localhost:${PORT}`, SERVER),
				headers
			})
		});
	});
}

const FIRST = 'Hedwig';
const LAST = 'Hinweisbach';

const card = (page: Page) => page.getByTestId('unlock-hint');

/** A platform authenticator that verifies the member, or refuses to. */
async function addAuthenticator(page: Page, verifies: boolean) {
	const cdp = await page.context().newCDPSession(page);
	await cdp.send('WebAuthn.enable');
	const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
		options: {
			protocol: 'ctap2',
			transport: 'internal',
			hasResidentKey: false,
			hasUserVerification: true,
			isUserVerified: verifies,
			automaticPresenceSimulation: true
		}
	});
	return { cdp, authenticatorId };
}

async function havePrivateEntry(page: Page) {
	await signIn(page);
	await addPerson(page, FIRST, LAST);
	const notes = page.locator('#section-notes');
	await notes.getByRole('button', { name: 'Add note' }).click();
	await page.getByRole('textbox', { name: 'Note' }).fill('Hedwig keeps a spare key');
	await notes.getByText('Private', { exact: true }).click();
	await notes.getByRole('button', { name: 'Add note' }).click();
	await expect(page.getByRole('textbox', { name: 'Note' })).toHaveCount(0);
}

async function openHome(page: Page) {
	await page.goto('/');
	await appReady(page);
}

test.beforeEach(async ({ page }) => {
	await relayToServer(page);
	await havePrivateEntry(page);
	await page.evaluate(() => localStorage.clear());
});

test.afterEach(async ({ page }) => {
	// A relayed request still in flight must not outlive the test.
	await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('setting it up from the card turns it into a line that goes for good', async ({ page }) => {
	await addAuthenticator(page, true);
	await openHome(page);
	await expect(card(page)).toBeVisible();

	await card(page).getByRole('button', { name: 'Set up device unlock' }).click();
	await expect(card(page)).toContainText('Device unlock is set up on this device');
	await card(page).getByRole('button', { name: 'Done' }).click();
	await expect(card(page)).toHaveCount(0);

	await openHome(page);
	await expect(card(page)).toHaveCount(0);
});

test('a device that does not confirm leaves the card with a line and the buttons back', async ({
	page
}) => {
	await addAuthenticator(page, false);
	await openHome(page);

	await card(page).getByRole('button', { name: 'Set up device unlock' }).click();
	await expect(card(page).getByRole('alert')).toContainText('Device unlock wasn’t set up');
	await expect(card(page).getByRole('button', { name: 'Set up device unlock' })).toBeEnabled();
});

test('Later hides it on this device, Not on this device hides it and can be taken back', async ({
	page
}) => {
	await addAuthenticator(page, true);
	await openHome(page);

	await card(page).getByRole('button', { name: 'Later' }).click();
	await expect(card(page)).toHaveCount(0);
	await expect(page.getByText('We’ll ask again in a week')).toBeVisible();
	await openHome(page);
	await expect(card(page)).toHaveCount(0);

	await page.evaluate(() => localStorage.clear());
	await openHome(page);
	await card(page).getByRole('button', { name: 'Not on this device' }).click();
	await expect(card(page)).toHaveCount(0);
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(card(page)).toBeVisible();

	await card(page).getByRole('button', { name: 'Not on this device' }).click();
	await openHome(page);
	await expect(card(page)).toHaveCount(0);
});

test('without passkey support there is no card', async ({ page }) => {
	await openHome(page);
	await expect(card(page)).toHaveCount(0);
});

import { expect, test, type Page } from '@playwright/test';
import { AUTH_STATE_PATH } from './auth-state';
import { addPerson, mention, openPerson, signIn } from './app';

/*
 * Keeping a moment for later (docs/02 §2.18, docs/concepts/offline-capture.md). Written after
 * the flow was verified in the running app (docs/08 §8.4.1).
 *
 * The suite blocks service workers (playwright.config.ts), so the page never *knows* it is
 * offline: `context.setOffline` makes the save fail on the way, which is the "Stella stops
 * answering in the middle of a save" path. Leaving offline fires the browser's `online`
 * event, one of the send triggers; a reload is another — the app opening.
 *
 * Refusa Wendt, Fotina and Pixelia Vogelsang are invented here and in no seed. The photo cases
 * each write about their own person: a moment joins its person's entry for the day, and the
 * photos show per entry, so a shared person would count another case's photo too.
 * There is no second member account, so "another member does not see them" stays a unit test
 * (`src/lib/pwa/outbox.test.ts`).
 */

const composerSave = (page: Page) => page.getByRole('button', { name: /^Save/ });
const kept = (page: Page) => page.getByTestId('outbox').locator('article');
const inStream = (page: Page, text: string) => page.getByTestId('stream').getByText(text);

/**
 * Stella's answer to the next sending of the outbox. The signal that a send triggered by the
 * app opening has happened — the outbox being empty right after a reload proves nothing, as it
 * is empty until it has been read from the device.
 */
const nextSending = (page: Page) =>
	page.waitForResponse(
		(response) => response.url().endsWith('/api/commands') && response.request().method() === 'POST'
	);

/** A 1×1 PNG, enough for the browser to downscale and Stella to store. */
const DOT_PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
	'base64'
);

async function keepMoment(page: Page, text: string): Promise<void> {
	await mention(page, 'Lena', /Lena Brunner/);
	await page.getByLabel('What happened?').pressSequentially(text);
	await composerSave(page).click();
	await expect(kept(page).filter({ hasText: text })).toContainText('Not sent yet');
}

test.describe('signed in', () => {
	test.beforeEach(async ({ page }) => {
		await signIn(page);
	});

	test('keeps a moment offline, edits it, and sends the edit when the device is back online', async ({
		page,
		context
	}) => {
		await context.setOffline(true);
		await keepMoment(page, 'fed the ducks at the pond');
		await expect(page.getByLabel('What happened?')).toHaveValue('');

		await kept(page).getByRole('button', { name: 'Edit' }).click();
		const field = page.getByLabel('What happened?');
		await expect(field).toHaveValue(/fed the ducks at the pond/);
		await field.fill((await field.inputValue()).replace('ducks', 'swans'));
		await composerSave(page).click();
		await expect(kept(page)).toContainText('fed the swans at the pond');
		await expect(kept(page)).toContainText('Not sent yet');

		await context.setOffline(false);
		await expect(inStream(page, 'fed the swans at the pond')).toBeVisible();
		await expect(page.getByTestId('outbox')).toHaveCount(0);
		await expect(inStream(page, 'fed the ducks at the pond')).toHaveCount(0);
	});

	test('discards a kept moment only when asked twice', async ({ page, context }) => {
		await context.setOffline(true);
		await keepMoment(page, 'a moment to throw away');

		await kept(page).getByRole('button', { name: 'Discard' }).click();
		await expect(kept(page)).toContainText('This device holds the only copy.');
		await kept(page).getByRole('button', { name: 'Cancel' }).click();
		await expect(kept(page)).toContainText('a moment to throw away');

		await kept(page).getByRole('button', { name: 'Discard' }).click();
		await kept(page).getByRole('button', { name: 'Discard for good' }).click();
		await expect(page.getByTestId('outbox')).toHaveCount(0);

		// Back online, and nothing arrives: the stream reloaded with the moment still absent.
		await context.setOffline(false);
		await page.reload();
		await expect(page.getByTestId('stream')).toBeVisible();
		await expect(inStream(page, 'a moment to throw away')).toHaveCount(0);
	});

	for (const [width, height] of [
		[412, 915],
		[360, 780]
	]) {
		test(`opens the composer sheet offline on a ${width}px phone and edits the kept moment there`, async ({
			page,
			context
		}) => {
			await page.setViewportSize({ width, height });
			await context.setOffline(true);

			await page.locator('nav a[aria-label="Write a moment"]').click();
			await expect(page.getByTestId('compose-sheet')).toBeVisible();
			await keepMoment(page, `kept from a ${width}px phone`);
			await expect(page.getByTestId('compose-sheet')).toHaveCount(0);

			await kept(page).getByRole('button', { name: 'Edit' }).click();
			await expect(page.getByTestId('compose-sheet')).toBeVisible();
			await expect(page.getByLabel('What happened?')).toHaveValue(
				new RegExp(`kept from a ${width}px phone`)
			);
			await page.getByRole('button', { name: 'Cancel' }).click();
			await expect(page.getByTestId('compose-sheet')).toHaveCount(0);
			await expect(kept(page)).toContainText('Not sent yet');

			await kept(page).getByRole('button', { name: 'Discard' }).click();
			await kept(page).getByRole('button', { name: 'Discard for good' }).click();
			await expect(page.getByTestId('outbox')).toHaveCount(0);
		});
	}

	test('keeps a moment with its photo offline and sends both when the app opens again', async ({
		page,
		context
	}) => {
		await addPerson(page, 'Fotina', 'Vogelsang');
		await signIn(page);
		await context.setOffline(true);
		await mention(page, 'Fotina', /Fotina Vogelsang/);
		await page.getByLabel('What happened?').pressSequentially('a photo kept for later');
		await page
			.locator('input[type=file][accept="image/*"]')
			.setInputFiles({ name: 'dot.png', mimeType: 'image/png', buffer: DOT_PNG });
		await composerSave(page).click();
		await expect(kept(page)).toContainText('a photo kept for later');
		await expect(kept(page)).toContainText('1 photo');

		await context.setOffline(false);
		await page.reload();
		// Only an arrived moment is in the stream, and its photo only once that has arrived too.
		const sent = page
			.getByTestId('stream')
			.locator('article', { hasText: 'a photo kept for later' });
		await expect(sent.locator('img')).toHaveCount(1);
		await expect(page.getByTestId('outbox')).toHaveCount(0);
	});

	test('saves a moment with a photo online without keeping anything', async ({ page }) => {
		await addPerson(page, 'Pixelia', 'Vogelsang');
		await signIn(page);
		await mention(page, 'Pixelia', /Pixelia Vogelsang/);
		await page.getByLabel('What happened?').pressSequentially('a photo saved straight away');
		await page
			.locator('input[type=file][accept="image/*"]')
			.setInputFiles({ name: 'dot.png', mimeType: 'image/png', buffer: DOT_PNG });
		await composerSave(page).click();

		const sent = page
			.getByTestId('stream')
			.locator('article', { hasText: 'a photo saved straight away' });
		await expect(sent.locator('img')).toHaveCount(1);
		await expect(page.getByTestId('outbox')).toHaveCount(0);
	});

	test('saves a kept moment once, even when the answer to its first sending was lost', async ({
		page,
		context
	}) => {
		await context.setOffline(true);
		await keepMoment(page, 'sent once despite a lost answer');

		// Stella receives and applies the batch; the answer never reaches the page.
		const applied = new Promise<void>((resolve) => {
			void page.route('**/api/commands', async (route) => {
				await route.fetch();
				await route.abort();
				resolve();
			});
		});
		await context.setOffline(false);
		await applied;
		await expect(kept(page)).toHaveAttribute('data-outbox-state', 'pending');

		// Sent again when the app opens: recognised by its name, not stored a second time.
		await page.unroute('**/api/commands');
		const resent = nextSending(page);
		await page.reload();
		const { answers } = (await (await resent).json()) as { answers: { status: string }[] };
		expect(answers.map((answer) => answer.status)).toEqual(['applied']);
		await expect(page.getByTestId('outbox')).toHaveCount(0);
		await page.reload();
		await expect(inStream(page, 'sent once despite a lost answer')).toHaveCount(1);
	});

	test('keeps a moment Stella refuses on arrival as could-not-send, with the reason', async ({
		page,
		context,
		browser
	}, testInfo) => {
		await addPerson(page, 'Refusa', 'Wendt');
		await signIn(page);
		await context.setOffline(true);
		await mention(page, 'Refusa', /Refusa Wendt/);
		await page.getByLabel('What happened?').pressSequentially('about someone deleted meanwhile');
		await composerSave(page).click();
		await expect(kept(page)).toContainText('Not sent yet');

		// Meanwhile, elsewhere and online, Refusa is deleted.
		const elsewhere = await browser.newContext({
			baseURL: testInfo.project.use.baseURL,
			storageState: AUTH_STATE_PATH,
			serviceWorkers: 'block'
		});
		const other = await elsewhere.newPage();
		await signIn(other);
		await openPerson(other, /Refusa Wendt/);
		await other.getByRole('button', { name: 'Delete for good' }).click();
		await other.getByRole('button', { name: 'Delete Refusa Wendt' }).click();
		await expect(other.getByRole('heading', { name: 'People' })).toBeVisible();
		await elsewhere.close();

		await context.setOffline(false);
		await expect(kept(page)).toHaveAttribute('data-outbox-state', 'refused');
		await expect(kept(page)).toContainText('Could not send');
		await expect(kept(page)).toContainText('about someone deleted meanwhile');
		// With Refusa gone the moment mentions nobody Stella knows, and that is what it says.
		await expect(kept(page)).toContainText('Mention at least one person with @');

		// Not dropped: it survives the app opening again, until it is discarded.
		await page.reload();
		await expect(kept(page)).toContainText('Could not send');
		await kept(page).getByRole('button', { name: 'Discard' }).click();
		await kept(page).getByRole('button', { name: 'Discard for good' }).click();
		await expect(page.getByTestId('outbox')).toHaveCount(0);
	});
});

test.describe('signing out', () => {
	// Its own session, so signing out cannot end the stored one the other specs start from.
	test.use({ storageState: { cookies: [], origins: [] } });

	test('asks before signing out with an unsent moment, keeps it, and sends it at the next sign-in', async ({
		page,
		context
	}) => {
		await signIn(page);
		await context.setOffline(true);
		await keepMoment(page, 'kept across a sign-out');

		await page.getByText('Demo Admin').first().click();
		await page.getByRole('button', { name: 'Sign out' }).click();
		await expect(page.getByRole('alertdialog')).toContainText('1 moment has not been sent yet');

		// Online again only now, with the way to Stella held shut, so nothing is sent before the
		// sign-out: the moment has to survive it.
		await page.route('**/api/commands', (route) => route.abort());
		await context.setOffline(false);
		await page.getByRole('button', { name: 'Keep and sign out' }).click();
		await expect(page).toHaveURL(/login/);

		await page.unroute('**/api/commands');
		await signIn(page);
		await expect(inStream(page, 'kept across a sign-out')).toBeVisible();
		await expect(page.getByTestId('outbox')).toHaveCount(0);
	});
});

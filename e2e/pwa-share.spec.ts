import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { COMMAND_PATIENCE_MS } from '../src/lib/pwa/outbox';
import { addPerson, signIn } from './app';

/*
 * Sharing into Stella from another app (docs/02 §2.18.3). The phone's share sheet posts a
 * multipart form to `/share`; here a form of the same shape posts it from a page, so the
 * service worker takes it exactly as it takes the system's. Belongs to the `pwa` project, the
 * only one that lets the worker run (`playwright.config.ts`). Written after the flow was
 * verified on a phone (docs/08 §8.4.1).
 *
 * Teilina Linkmann, Gabrina Drachen, Fotara Teilberg, Avara Einzeln and Stillara Funkstill are
 * invented here and in no seed.
 */

/** A 1×1 PNG, enough for the browser to downscale and Stella to store. */
const DOT_PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
	'base64'
);

/** Waits until the service worker controls the page, so the share's post goes through it. */
async function underWorker(page: Page): Promise<void> {
	await page.evaluate(async () => {
		await navigator.serviceWorker.ready;
		if (navigator.serviceWorker.controller) return;
		await new Promise((resolve) =>
			navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true })
		);
	});
}

/**
 * Shares from "another app": the manifest's `share_target` form, built on the page and
 * submitted, so the navigation is the same POST the system sends.
 */
async function share(
	page: Page,
	parts: { title?: string; text?: string; url?: string; photos?: number }
): Promise<void> {
	await page.evaluate(
		(fields) => {
			const form = document.createElement('form');
			form.method = 'post';
			form.enctype = 'multipart/form-data';
			form.action = '/share';
			form.id = 'e2e-share';
			for (const [name, value] of Object.entries(fields)) {
				const input = document.createElement('input');
				input.type = 'hidden';
				input.name = name;
				input.value = value;
				form.append(input);
			}
			const files = document.createElement('input');
			files.type = 'file';
			files.name = 'files';
			files.multiple = true;
			form.append(files);
			document.body.append(form);
		},
		{ title: parts.title ?? '', text: parts.text ?? '', url: parts.url ?? '' }
	);
	const count = parts.photos ?? 0;
	if (count > 0) {
		await page.locator('#e2e-share input[name=files]').setInputFiles(
			Array.from({ length: count }, (_, index) => ({
				name: `shared-${index}.png`,
				mimeType: 'image/png',
				buffer: DOT_PNG
			}))
		);
	}
	await page.evaluate(() => (document.getElementById('e2e-share') as HTMLFormElement).submit());
	await page.waitForURL(/\/share\?pending=/);
	await expect(page.getByTestId('share-people')).toBeVisible();
}

/** Picks the person the share is about, by a search for their name. */
async function pick(page: Page, name: string): Promise<void> {
	await page.getByTestId('share-search').fill(name);
	await page
		.getByTestId('share-people')
		.getByRole('button', { name: new RegExp(name) })
		.click();
}

const target = (page: Page, name: RegExp) => page.getByRole('radio', { name });
const saveButton = (page: Page) => page.getByTestId('share-save');
/** The toast the person's page shows once the share is saved. */
const toast = (page: Page, text: string) =>
	page.getByRole('region', { name: 'Notifications' }).filter({ hasText: text });

/** A network that takes every request and answers none — the phone in flight mode. */
async function neverAnswer(context: BrowserContext): Promise<void> {
	await context.route('**/*', () => {});
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
	await underWorker(page);
});

test('saves shared words as a moment about the person picked', async ({ page }) => {
	await addPerson(page, 'Teilina', 'Linkmann');
	await share(page, { text: 'the ferry timetable', url: 'https://example.org/ferry' });

	// Opened on this device a moment ago, so offered before anything is typed.
	await expect(page.getByTestId('share-people')).toContainText('Teilina');
	await expect(target(page, /^Moment/)).toBeChecked();
	await page
		.getByTestId('share-people')
		.getByRole('button', { name: /Teilina/ })
		.click();
	await saveButton(page).click();

	await expect(page.getByRole('heading', { name: 'Teilina Linkmann' })).toBeVisible();
	await expect(toast(page, 'Moment saved')).toBeVisible();
	await expect(page.getByText('the ferry timetable').first()).toBeVisible();
});

test('saves a shared link as a gift idea', async ({ page }) => {
	await addPerson(page, 'Gabrina', 'Drachen');
	await share(page, { title: 'Kite for the beach', url: 'https://example.org/kite' });
	await pick(page, 'Gabrina');
	await target(page, /Gift idea/).check();
	await saveButton(page).click();

	await expect(toast(page, 'Gift idea saved')).toBeVisible();
	await expect(page.locator('#section-gifts')).toContainText('Kite for the beach');
});

test('saves several shared photos to the gallery, and offers no profile photo for them', async ({
	page
}) => {
	await addPerson(page, 'Fotara', 'Teilberg');
	await share(page, { photos: 3 });

	await expect(target(page, /As profile photo/)).toBeDisabled();
	await expect(page.getByTestId('share-targets')).toContainText('Only with a single photo');
	await expect(target(page, /To the photos/)).toBeChecked();
	await pick(page, 'Fotara');
	await saveButton(page).click();

	await expect(page.getByRole('heading', { name: 'Fotara Teilberg' })).toBeVisible();
	await expect(page.getByTestId('photo-grid').locator('li[data-source="stella"]')).toHaveCount(3);
});

test('offers the profile photo for a single shared photo', async ({ page }) => {
	await addPerson(page, 'Avara', 'Einzeln');
	await share(page, { photos: 1 });

	await expect(target(page, /As profile photo/)).toBeEnabled();
});

test('puts the words back in the address when the server takes the share', async ({
	page,
	baseURL
}) => {
	// No worker took it (the app not installed yet): the server answers with the sheet's address.
	const response = await page.request.post('/share', {
		headers: { accept: 'text/html', origin: baseURL ?? '' },
		multipart: { title: '', text: 'a recipe for plum cake', url: 'https://example.org/plums' },
		maxRedirects: 0
	});
	expect(response.status()).toBe(303);
	const sheet = new URL(response.headers()['location'] ?? '', baseURL);
	expect(sheet.pathname).toBe('/share');
	expect(sheet.searchParams.get('text')).toContain('a recipe for plum cake');

	await page.goto(sheet.pathname + sheet.search);
	await expect(page.getByTestId('share-sheet')).toContainText('a recipe for plum cake');
});

test('keeps a share for later when Stella never answers', async ({ page, context }) => {
	await addPerson(page, 'Stillara', 'Funkstill');
	await share(page, { text: 'the bakery opens at six' });
	await pick(page, 'Stillara');
	await neverAnswer(context);

	// The save waits its full patience for an answer, then keeps the moment on the device.
	test.setTimeout(COMMAND_PATIENCE_MS * 2 + 30_000);
	// Its toast is gone again by the time the person's page has waited out the network too, so
	// the kept moment there is the signal.
	await saveButton(page).click();
	const kept = page.getByTestId('kept-moments').locator('li');
	await expect(kept.filter({ hasText: 'the bakery opens at six' })).toContainText('Not sent yet', {
		timeout: COMMAND_PATIENCE_MS + 10_000
	});
});

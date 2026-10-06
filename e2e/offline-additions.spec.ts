import { expect, test, type Page } from '@playwright/test';
import { addPerson, factEditor, fillDate, profileRow, signIn } from './app';

/*
 * The additions a person's page and their journal keep while Stella is out of reach, and what
 * saving through the outbox means while it is in reach (docs/02 §2.18, §2.20;
 * docs/concepts/offline-capture.md §8 #10, #22). The maintainer chose to verify these in the
 * released app rather than a preview, and asked for the e2e to go ahead (docs/08 §8.4.1).
 *
 * As in `offline-person.spec.ts`, service workers are blocked, so the page does not know it is
 * offline: `context.setOffline` makes the save fail on the way, and the form keeps it instead.
 *
 * Every case works on a person of its own, invented here and in no seed: a journal entry is
 * one per person, author and day, and a gallery shared with another case would count its
 * photos too.
 */

/** Stella's answer to the next sending of the outbox (see `offline-capture.spec.ts`). */
const nextSending = (page: Page) =>
	page.waitForResponse(
		(response) => response.url().endsWith('/api/commands') && response.request().method() === 'POST'
	);

/** A 1×1 PNG, enough for the browser to downscale and Stella to store. */
const DOT_PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
	'base64'
);
const dot = (name: string) => ({ name, mimeType: 'image/png', buffer: DOT_PNG });

/** From a person's page to their journal, with the composer open. */
async function openJournal(page: Page): Promise<void> {
	await page.getByRole('link', { name: 'Write' }).first().click();
	await expect(page.getByRole('heading', { name: 'Journal' })).toBeVisible();
	await page.getByRole('button', { name: 'Write a moment' }).click();
}

async function writeEntry(page: Page, body: string): Promise<void> {
	await page.getByRole('textbox', { name: 'Moment', exact: true }).fill(body);
	await page.getByRole('button', { name: 'Save moment' }).click();
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('keeps a contact detail and a date offline as dashed chips, and sends them when back', async ({
	page,
	context
}) => {
	await addPerson(page, 'Feldina', 'Vogelsang');
	const personPage = page.url();
	await context.setOffline(true);

	const contact = await profileRow(page, 'Contact');
	await contact.getByRole('button', { name: 'Add' }).click();
	await contact.getByLabel('Kind').selectOption({ label: 'Phone' });
	await contact.getByPlaceholder('Value').fill('+41 79 555 01 23');
	await contact.getByRole('button', { name: 'Add', exact: true }).last().click();
	await expect(page.getByTestId('kept-fields').locator('li')).toContainText(
		'Phone · +41 79 555 01 23'
	);

	// Nothing on record yet, so the dates' editor opens on its form.
	const dates = await factEditor(page, 'dates');
	await dates.getByLabel('Kind').selectOption({ label: 'Anniversary' });
	await fillDate(dates, 'Day', '2011-06-18');
	await dates.getByRole('button', { name: 'Add', exact: true }).last().click();
	await expect(page.getByTestId('kept-dates').locator('li')).toContainText('Anniversary');

	// Also on Home, saying whom they are about — seen there while the way to Stella is held shut.
	await page.route('**/api/commands', (route) => route.abort());
	await context.setOffline(false);
	await page.goto('/');
	const outbox = page.getByTestId('outbox');
	await expect(outbox).toContainText('contact detail for Feldina Vogelsang');
	await expect(outbox).toContainText('date for Feldina Vogelsang');

	await page.unroute('**/api/commands');
	const sent = nextSending(page);
	await page.reload();
	await sent;
	await expect(outbox).toHaveCount(0);
	await page.goto(personPage);
	await expect((await profileRow(page, 'Contact')).getByText('+41 79 555 01 23')).toBeVisible();
	await expect(page.getByTestId('identity-facts')).toContainText('Anniversary');
	await expect(page.locator('li[data-outbox-state]')).toHaveCount(0);
});

test('keeps a journal entry offline above the timeline, and sends it with its photo when back', async ({
	page,
	context
}) => {
	await addPerson(page, 'Journa', 'Vogelsang');
	await openJournal(page);
	await context.setOffline(true);

	await page.getByLabel('Add photos').setInputFiles([dot('kept-entry.png')]);
	await expect(page.getByText('1 photo ready')).toBeVisible();
	await writeEntry(page, 'a kept entry from the mountain hut');
	const kept = page.getByTestId('kept-entries').locator('li');
	await expect(kept).toContainText('a kept entry from the mountain hut');
	await expect(kept).toContainText('Not sent yet');
	await expect(page.getByRole('button', { name: 'Save moment' })).toHaveCount(0);

	await context.setOffline(false);
	await expect(page.getByTestId('kept-entries')).toHaveCount(0);
	await page.reload();
	const entry = page.locator('article', { hasText: 'a kept entry from the mountain hut' });
	await expect(entry).toBeVisible();
	await expect(entry.locator('img')).toHaveCount(1);
});

test('keeps gallery photos offline, and adds them to the gallery when back', async ({
	page,
	context
}) => {
	await addPerson(page, 'Galeria', 'Vogelsang');
	await context.setOffline(true);

	await page.getByRole('button', { name: 'Add photos' }).click();
	const form = page.locator('#section-photos form');
	await form.locator('input[name=files]').setInputFiles([dot('first.png'), dot('second.png')]);
	await form.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByTestId('kept-gallery').locator('li')).toContainText('Not sent yet');

	await context.setOffline(false);
	await expect(page.getByTestId('kept-gallery')).toHaveCount(0);
	await page.reload();
	await expect(page.getByTestId('photo-grid').locator('img')).toHaveCount(2);
});

test('adds a second journal entry written on the same day to the first', async ({ page }) => {
	await addPerson(page, 'Doppla', 'Vogelsang');
	await openJournal(page);
	await writeEntry(page, 'the morning at the lake');
	const days = page.locator('article');
	await expect(days).toHaveCount(1);
	await expect(days).toContainText('the morning at the lake');

	await page.getByRole('button', { name: 'Write a moment' }).click();
	await writeEntry(page, 'the evening by the fire');
	await expect(days).toContainText('the evening by the fire');
	await expect(days).toHaveCount(1);
	await expect(days).toContainText('the morning at the lake');
});

test('shows why Stella refused a date, keeps what was typed, and saves it once named', async ({
	page
}) => {
	await addPerson(page, 'Datina', 'Vogelsang');

	const dates = await factEditor(page, 'dates');
	await dates.getByLabel('Kind').selectOption({ label: 'Custom' });
	await fillDate(dates, 'Day', '2019-09-07');
	await dates.getByRole('button', { name: 'Add', exact: true }).last().click();
	await expect(dates).toContainText('Give the date a name so it means something later.');
	await expect(dates.getByLabel('Kind')).toHaveValue('custom');
	await expect(
		dates.getByRole('group', { name: 'Day' }).getByLabel('Year', { exact: true })
	).toHaveValue('2019');
	// A refusal is not kept for later.
	await expect(page.getByTestId('kept-dates')).toHaveCount(0);

	await dates.getByPlaceholder('Name (for custom)').fill('First climb');
	await dates.getByRole('button', { name: 'Add', exact: true }).last().click();
	await expect(dates.getByText('First climb')).toBeVisible();
	await expect(dates).not.toContainText('Give the date a name');
});

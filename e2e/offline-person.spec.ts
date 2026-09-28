import { expect, test, type Page } from '@playwright/test';
import { addPerson, openPerson, pickPerson, profileRow, signIn } from './app';

/*
 * What a person's page and *Add person* keep while Stella is out of reach (docs/02 §2.18).
 * Written after the flow was verified in the running app (docs/08 §8.4.1).
 *
 * As in `offline-capture.spec.ts`, service workers are blocked, so the page does not know it
 * is offline: `context.setOffline` makes the post fail, and the form keeps it instead.
 *
 * Offlina Testerin, Chipo, Onlino and Offlino Vogelsang are invented here and in no seed. The
 * notes and the call go to Lena Brunner under words no other spec uses; the tag and the circle
 * go to Chipo, because `person-page-layout.spec.ts` relies on Lena having no tags.
 */

/** Stella's answer to the next sending of the outbox (see `offline-capture.spec.ts`). */
const nextSending = (page: Page) =>
	page.waitForResponse(
		(response) => response.url().endsWith('/api/commands') && response.request().method() === 'POST'
	);

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('keeps a note offline at the top of the notes, edits it, and sends it when the app opens', async ({
	page,
	context
}) => {
	await openPerson(page, /Lena Brunner/);
	await context.setOffline(true);

	await page.getByRole('button', { name: 'Add note' }).click();
	await page.getByRole('textbox', { name: 'Note' }).fill('a kept note about the garden');
	await page.getByRole('button', { name: 'Add note' }).click();
	const keptNote = page.getByTestId('kept-notes').locator('li');
	await expect(keptNote).toContainText('a kept note about the garden');
	await expect(keptNote).toContainText('Not sent yet');

	await keptNote.getByRole('button', { name: 'Edit' }).click();
	const field = page.getByRole('textbox', { name: 'Note' });
	await expect(field).toHaveValue('a kept note about the garden');
	await field.fill('a kept note about the orchard');
	await page.getByRole('button', { name: 'Save' }).last().click();
	await expect(keptNote).toContainText('a kept note about the orchard');

	// Also on Home, saying whom it is about — seen there while the way to Stella is held shut.
	await page.route('**/api/commands', (route) => route.abort());
	await context.setOffline(false);
	await page.goto('/');
	await expect(page.getByTestId('outbox')).toContainText('note on Lena Brunner');
	await expect(page.getByTestId('outbox')).toContainText('a kept note about the orchard');

	await page.unroute('**/api/commands');
	const sent = nextSending(page);
	await page.reload();
	await sent;
	await expect(page.getByTestId('outbox')).toHaveCount(0);
	await openPerson(page, /Lena Brunner/);
	await expect(page.getByText('a kept note about the orchard')).toBeVisible();
	await expect(page.getByText('a kept note about the garden')).toHaveCount(0);
	await expect(page.getByTestId('kept-notes')).toHaveCount(0);
});

test('keeps a call offline in the story, edits its kind and title, and sends it when back online', async ({
	page,
	context
}) => {
	await openPerson(page, /Lena Brunner/);
	const story = page.locator('#section-story');
	await context.setOffline(true);

	await story.getByRole('button', { name: 'Log contact' }).click();
	await page.locator('select[name=kind]').selectOption('video');
	await page.locator('input[name=title]').fill('a kept video call');
	await page.getByRole('button', { name: 'Log interaction' }).click();
	const keptLog = page.getByTestId('kept-logs').locator('li');
	await expect(keptLog).toContainText('a kept video call');
	await expect(keptLog).toContainText('Video');

	await keptLog.getByRole('button', { name: 'Edit' }).click();
	await expect(page.locator('input[name=title]')).toHaveValue('a kept video call');
	await expect(page.locator('select[name=kind]')).toHaveValue('video');
	await page.locator('input[name=title]').fill('a kept video call, edited');
	await page.getByRole('button', { name: 'Save' }).last().click();
	await expect(keptLog).toContainText('a kept video call, edited');

	await context.setOffline(false);
	await expect(
		page.locator('[data-story-item]', { hasText: 'a kept video call, edited' })
	).toBeVisible();
	await expect(page.getByTestId('kept-logs')).toHaveCount(0);
});

test('keeps a tag and a circle offline as dashed chips and sends them when back online', async ({
	page,
	context
}) => {
	await addPerson(page, 'Chipo', 'Vogelsang');
	await context.setOffline(true);

	const tags = await profileRow(page, 'Tags');
	await tags.getByRole('button', { name: 'Add' }).click();
	await tags.getByPlaceholder('Tag name').fill('offline-choir');
	await tags.getByRole('button', { name: 'Add', exact: true }).last().click();
	await expect(tags.locator('li[data-outbox-state]')).toContainText('offline-choir');

	const circles = await profileRow(page, 'Circles');
	await circles.getByRole('button', { name: 'Join' }).click();
	await circles.getByPlaceholder('Join or create a circle…').fill('Offline Walkers');
	await circles.getByPlaceholder('role (optional)').fill('lead');
	await circles.getByRole('button', { name: 'Add', exact: true }).last().click();
	await expect(circles.locator('li[data-outbox-state]')).toContainText('Offline Walkers · lead');

	const sent = nextSending(page);
	await context.setOffline(false);
	await sent;
	await page.reload();
	// The chips Stella now has, not the kept ones — those carry their outbox state.
	const stored = (row: string, text: string) =>
		page.locator(`section[data-row="${row}"] li:not([data-outbox-state])`, { hasText: text });
	await expect(stored('Tags', 'offline-choir')).toBeVisible();
	await expect(stored('Circles', 'Offline Walkers')).toBeVisible();
	await expect(page.locator('li[data-outbox-state]')).toHaveCount(0);
});

test('keeps a relationship offline and sends it when back online', async ({ page, context }) => {
	await addPerson(page, 'Offlina', 'Testerin');
	await context.setOffline(true);

	await page.getByRole('button', { name: 'Add relationship' }).click();
	const form = page.locator('form[action="?/addRelationship"]');
	await form.locator('select[name=typeChoice]').selectOption({ label: 'Friend of' });
	await pickPerson(form.getByLabel('Person'), 'Corinne Keller');
	await form.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByTestId('kept-links').locator('li')).toContainText(
		'Friend of Corinne Keller'
	);

	await context.setOffline(false);
	await expect(page.getByTestId('kept-links')).toHaveCount(0);
	await page.reload();
	await expect(
		page
			.locator('#section-relationships')
			.getByRole('link', { name: 'Corinne Keller', exact: true })
	).toBeVisible();
});

test('keeps a new person offline, stays ready for the next, and adds them when back', async ({
	page,
	context
}) => {
	// Online, *Add person* still opens the new page.
	await addPerson(page, 'Onlino', 'Vogelsang');

	await page.goto('/contacts/new');
	await context.setOffline(true);
	await page.getByLabel('First name').fill('Offlino');
	await page.getByLabel('Last name').fill('Vogelsang');
	await page.getByRole('button', { name: 'Add person' }).last().click();
	await expect(
		page.getByRole('status').filter({ hasText: 'Offlino Vogelsang is kept on this device' })
	).toBeVisible();
	await expect(page.getByLabel('First name')).toHaveValue('');

	await context.setOffline(false);
	const sent = nextSending(page);
	await page.goto('/');
	await sent;
	await expect(page.getByTestId('outbox')).toHaveCount(0);
	await openPerson(page, /Offlino Vogelsang/);
	await expect(page.getByRole('heading', { name: 'Offlino Vogelsang' })).toBeVisible();
});

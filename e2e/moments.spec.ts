import { expect, test, type Page } from '@playwright/test';
import { appReady, mention, mentionNew, openComposer, openPerson, signIn } from './app';

/*
 * Moments capture and the household stream (docs/02 §2.22). Written after the flow was
 * verified in the running app (docs/08 §8.4.1). The suite runs against a fresh database
 * seeded with the demo dataset, signed in as the demo admin.
 *
 * People invented here (Zelda, Yorick, Quill, Ulric, Vesna) are deliberately absent from the
 * demo dataset, so the "Create …" path never collides with a seeded contact.
 */

const composerSave = (page: Page) => page.getByRole('button', { name: /^Save/ });

test.beforeEach(async ({ page }) => {
	await signIn(page);
	await openComposer(page);
});

test('captures a moment on an existing person and shows it in the stream', async ({ page }) => {
	await mention(page, 'Lena', /Lena Brunner/);
	await page.getByLabel('What happened?').pressSequentially('played the piano piece all the way through');
	await expect(page.getByText("Goes to Lena Brunner’s journal")).toBeVisible();

	await composerSave(page).click();

	const moment = page.locator('article').first();
	await expect(moment).toContainText('You');
	await expect(moment).toContainText('wrote in');
	await expect(moment.getByRole('link', { name: 'Lena Brunner' }).first()).toBeVisible();
	await expect(moment).toContainText('played the piano piece all the way through');
});

test('creates the people it mentions and offers to link the first two', async ({ page }) => {
	await page.getByLabel('What happened?').pressSequentially('Met ');
	await mentionNew(page, 'Zelda');
	await page.getByLabel('What happened?').pressSequentially('and ');
	await mentionNew(page, 'Yorick');
	await page.getByLabel('What happened?').pressSequentially('at the market');

	await composerSave(page).click();

	// The moment is anchored on the first person and lists the second as a mention chip.
	const moment = page.locator('article').first();
	await expect(moment.getByRole('link', { name: 'Zelda' }).first()).toBeVisible();
	await expect(moment).toContainText('at the market');
	await expect(moment.getByRole('link', { name: 'Yorick' }).first()).toBeVisible();

	// Both people were created inline and appear in the stream in their own right.
	const added = page.locator('article', { hasText: 'New person' });
	await expect(added.filter({ hasText: 'Zelda' })).toHaveCount(1);
	await expect(added.filter({ hasText: 'Yorick' })).toHaveCount(1);

	// The relationship is offered, never guessed: the hint links to the other person's page.
	const hint = page.getByRole('status');
	await expect(hint).toContainText('Link Zelda and Yorick?');
	await hint.getByRole('link', { name: 'Link' }).click();
	await expect(page).toHaveURL(/\/contacts\/[^/?]+\?relate=[^#]+#relationships/);
});

test('keeps a private moment marked as private', async ({ page }) => {
	await page.getByText('Shared', { exact: true }).click();
	await expect(page.getByText('Private', { exact: true })).toBeVisible();

	await page.getByLabel('What happened?').pressSequentially('Coffee with ');
	await mentionNew(page, 'Quill');
	await page.getByLabel('What happened?').pressSequentially('about the surprise party');

	await composerSave(page).click();

	const moment = page.locator('article').first();
	await expect(moment).toContainText('about the surprise party');
	await expect(moment).toContainText('private');
});

test('refuses to save a moment that mentions nobody', async ({ page }) => {
	await page.getByLabel('What happened?').pressSequentially('Nice day today');

	await expect(page.getByText('Mention at least one person with @')).toBeVisible();
	await expect(composerSave(page)).toBeDisabled();
});

test('adds a second moment about the same person that day to the first, keeping both', async ({ page }) => {
	await mentionNew(page, 'Ulric');
	await page.getByLabel('What happened?').pressSequentially('repotted the ferns');
	await composerSave(page).click();
	await expect(page.locator('article').first()).toContainText('repotted the ferns');

	// A save closes the composer, so the second moment opens it again.
	await openComposer(page);
	// Exact: the shared suite database also holds a Gina Ulrich.
	await mention(page, 'Ulric', /^Ulric$/);
	await page.getByLabel('What happened?').pressSequentially('phoned, ');
	await mentionNew(page, 'Vesna');
	await page.getByLabel('What happened?').pressSequentially('sends her love');
	await composerSave(page).click();
	// The entry the moment joined rises to the top, above Vesna's "New person" item.
	const top = page.locator('article').first();
	await expect(top).toContainText('sends her love');
	await expect(top).toContainText('repotted the ferns');

	// One day slot, one entry: the earlier moment is still there beside the later one.
	await openPerson(page, /\bUlric\b/);
	await page.getByRole('link', { name: 'Write' }).first().click();
	await expect(page.getByRole('heading', { name: 'Journal' })).toBeVisible();
	await appReady(page);
	const entries = page.locator('article', { hasText: 'repotted the ferns' });
	await expect(entries).toHaveCount(1);
	await expect(entries).toContainText('sends her love');

	// The second moment's mention joined the entry, so it shows on Vesna's page too.
	await openPerson(page, /Vesna/);
	await expect(page.getByTestId('mentioned-in').locator('a[data-kind="journal"]')).toHaveCount(1);
});

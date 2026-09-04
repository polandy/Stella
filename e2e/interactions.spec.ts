import { expect, test, type Page } from '@playwright/test';

/*
 * Touchpoints on the story timeline and "last contacted" (docs/02 §2.6, §2.23). Written after
 * the flow was verified in the running app (docs/08 §8.4.1). Runs against the demo dataset,
 * signed in as the demo admin; the touchpoints logged here use a title no seeded data contains.
 */

/** Signs in through the SEED_DEMO one-click button and lands on Home. */
async function signIn(page: Page): Promise<void> {
	await page.goto('/login');
	await page.getByRole('button', { name: 'Sign in as demo user' }).click();
	await expect(page.getByRole('heading', { name: 'What happened?' })).toBeVisible();
}

/** Opens a seeded person's page from the contacts list, on the story tab it opens with. */
async function openPerson(page: Page, name: RegExp): Promise<void> {
	await page.goto('/contacts');
	await page.getByRole('link', { name }).first().click();
	await expect(page.getByRole('tab', { name: 'Story' })).toHaveAttribute('aria-selected', 'true');
}

/** Opens the "log a touchpoint" form, which the story section keeps closed until asked. */
async function openLogForm(page: Page) {
	const panel = page.locator('#panel-story');
	await panel.getByRole('button', { name: 'Log contact' }).click();
	return panel;
}

/** The story items themselves, not the day headings they are grouped under. */
const storyItems = (page: Page) => page.locator('[data-story-item]');

const TITLE = 'Quill call about the harbour trip';

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('logs a call with a participant, shows it on the timeline and derives last contacted', async ({ page }) => {
	await openPerson(page, /Lena Brunner/);
	await expect(page.getByText('Nothing written down yet.')).toBeVisible();
	await expect(page.getByTestId('last-contacted')).toContainText('No contact logged yet');

	const section = await openLogForm(page);
	await section.getByLabel('Kind').selectOption('call');
	await section.getByLabel('Day').fill('2026-09-01');
	await section.getByPlaceholder('What happened? (optional)').fill(TITLE);
	await section.getByPlaceholder('Details… (optional)').fill('She wants Oma to come along.');
	await section.getByLabel('Who else was there?').selectOption({ label: 'Markus Brunner' });
	await section.getByRole('button', { name: 'Log interaction' }).click();

	const timeline = page.getByTestId('story-timeline');
	await expect(timeline).toContainText('Call');
	await expect(timeline).toContainText('1 September 2026');
	await expect(timeline).toContainText(TITLE);
	await expect(timeline).toContainText('She wants Oma to come along.');
	await expect(timeline.getByRole('link', { name: 'Markus Brunner' })).toBeVisible();

	// "Last contacted" is derived from the timeline, not stored separately.
	await expect(page.getByTestId('last-contacted')).toContainText('1 September 2026');
});

test('orders the timeline most recent day first and last contacted follows the newest', async ({ page }) => {
	await openPerson(page, /Lena Brunner/);
	const section = await openLogForm(page);

	await section.getByLabel('Kind').selectOption('met');
	await section.getByLabel('Day').fill('2026-08-20');
	await section.getByPlaceholder('What happened? (optional)').fill('Quill lunch, the earlier one');
	await section.getByRole('button', { name: 'Log interaction' }).click();

	const items = storyItems(page);
	await expect(items).toHaveCount(2);
	await expect(items.first()).toContainText(TITLE);
	await expect(items.last()).toContainText('Quill lunch, the earlier one');
	await expect(page.getByTestId('last-contacted')).toContainText('1 September 2026');
});

test('shows the logged interaction in the household stream, linking to the person', async ({ page }) => {
	const item = page.locator('article', { hasText: TITLE }).first();
	await expect(item).toContainText('You');
	await expect(item).toContainText('logged');
	await expect(item).toContainText('call');
	await expect(item.getByRole('link', { name: 'Lena Brunner' })).toHaveAttribute(
		'href',
		/\/contacts\/[^/#]+$/
	);
	await expect(item.getByRole('link', { name: 'Markus Brunner' })).toBeVisible();
});

test('refuses a day that does not exist and keeps the timeline unchanged', async ({ page }) => {
	await openPerson(page, /Lena Brunner/);
	const section = await openLogForm(page);
	const before = await storyItems(page).count();

	// The date input cannot produce 30 February, so the guard is exercised through the form's
	// raw value: type into the field via the DOM the way a scripted client would.
	await section.getByLabel('Day').evaluate((el: HTMLInputElement) => {
		el.type = 'text';
		el.value = '2026-02-30';
	});
	await section.getByRole('button', { name: 'Log interaction' }).click();

	await expect(section.getByText('There is no such day in the calendar: 2026-02-30.')).toBeVisible();
	await expect(storyItems(page)).toHaveCount(before);
});

test('removes an own interaction and last contacted moves to the remaining one', async ({ page }) => {
	await openPerson(page, /Lena Brunner/);
	const newest = storyItems(page).first();
	await expect(newest).toContainText(TITLE);
	await newest.getByRole('button', { name: 'Remove interaction' }).click();

	const timeline = page.getByTestId('story-timeline');
	await expect(timeline).not.toContainText(TITLE);
	await expect(timeline).toContainText('Quill lunch, the earlier one');
	await expect(page.getByTestId('last-contacted')).toContainText('20 August 2026');
});

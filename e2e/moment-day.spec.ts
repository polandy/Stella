import { expect, test, type Locator, type Page } from '@playwright/test';
import { appReady, mention, mentionNew, signIn } from './app';

/*
 * The day of a moment (docs/02 §2.22.1, docs/05 §5.7): a Today pill offering the last week,
 * and a calendar with a year choice for anything older. Written after the flow was verified
 * in the running app (docs/08 §8.4.1).
 *
 * Hortensia and Leopoldine are invented here and absent from the demo dataset. Each case
 * writes its own sentence, so it finds its moment whatever else the suite has written.
 */

const PIXEL_9_PRO = { width: 412, height: 915 };

const composerSave = (page: Page) => page.getByRole('button', { name: /^Save/ });
const dayPill = (page: Page) => page.getByRole('button', { name: /^Day:/ });

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

/** Follows the saved moment's "wrote in <name>'s journal" link, where each day is its own heading. */
async function journalOf(page: Page, moment: string, name: string) {
	await page.locator('article', { hasText: moment }).getByRole('link', { name, exact: true }).first().click();
	await page.waitForURL(/\/contacts\/[^/]+\/journal$/);
	return page.getByRole('listitem').filter({ has: page.getByRole('heading', { level: 2 }) });
}

/** The short date the pill's menu gives a day, e.g. "28 Sept" — a prefix of the journal's "28 September". */
async function dateOffered(page: Page, name: RegExp): Promise<string> {
	await dayPill(page).click();
	const offered = (await page.getByRole('menuitemradio', { name }).locator('span').textContent()) ?? '';
	expect(offered).toMatch(/^\d+ \w+/);
	return offered;
}

test('files a moment under yesterday when it is picked from the day pill', async ({ page }) => {
	await page.getByLabel('What happened?').pressSequentially('Tea with ');
	await mentionNew(page, 'Leopoldine');
	await page.getByLabel('What happened?').pressSequentially('in the rose garden, a day late');
	await expect(dayPill(page)).toHaveAccessibleName('Day: Today');

	const yesterday = await dateOffered(page, /^Yesterday/);
	await page.getByRole('menuitemradio', { name: /^Yesterday/ }).click();
	await expect(dayPill(page)).toHaveAccessibleName('Day: Yesterday');
	await composerSave(page).click();
	await expect(page.locator('article', { hasText: 'in the rose garden, a day late' })).toBeVisible();
	// Back to today for the next moment.
	await expect(dayPill(page)).toHaveAccessibleName('Day: Today');

	const days = await journalOf(page, 'in the rose garden, a day late', 'Leopoldine');
	await expect(days).toHaveCount(1);
	await expect(days.getByRole('heading')).toContainText(yesterday);
	await expect(days).toContainText('in the rose garden, a day late');
});

test('picks an older day from the calendar, the year chosen beside the month', async ({ page }) => {
	await page.getByLabel('What happened?').pressSequentially('Danced with ');
	await mentionNew(page, 'Hortensia');
	await page.getByLabel('What happened?').pressSequentially('at the harvest ball');

	await dayPill(page).click();
	await page.getByRole('menuitem', { name: 'Another day…' }).click();
	const calendar = page.getByRole('group', { name: 'Choose a day' });
	const next = calendar.getByRole('button', { name: 'Next month' });

	// Nothing after today: the calendar opens on this month and cannot page past it.
	await expect(next).toBeDisabled();

	await calendar.getByLabel('Year').selectOption('2019');
	await calendar.getByRole('button', { name: /\b15 \w+ 2019$/ }).click();
	await expect(dayPill(page)).toHaveAccessibleName(/^Day: .*15 .*2019$/);
	await composerSave(page).click();
	await expect(page.locator('article', { hasText: 'at the harvest ball' })).toBeVisible();

	const days = await journalOf(page, 'at the harvest ball', 'Hortensia');
	await expect(days).toHaveCount(1);
	await expect(days.getByRole('heading')).toContainText(/\b15 \w+ 2019$/);
	await expect(days).toContainText('at the harvest ball');
});

test('keeps a moment on today unless another day is picked', async ({ page }) => {
	await mention(page, 'Lena', /Lena Brunner/);
	await page.getByLabel('What happened?').pressSequentially('baked the plum cake');
	const today = await dateOffered(page, /^Today/);
	await page.keyboard.press('Escape');
	await composerSave(page).click();
	await expect(page.locator('article', { hasText: 'baked the plum cake' })).toBeVisible();

	const days = await journalOf(page, 'baked the plum cake', 'Lena Brunner');
	await expect(days.filter({ hasText: 'baked the plum cake' }).getByRole('heading')).toContainText(today);
});

test.describe('on a phone', () => {
	test.use({ viewport: PIXEL_9_PRO });

	test('opens the calendar above the pill and keeps its arrows in place from month to month', async ({ page }) => {
		await page.goto('/');
		await appReady(page);
		await page.locator('nav').getByRole('link', { name: 'Write a moment' }).click();
		await expect(page.getByTestId('compose-sheet')).toBeVisible();

		// The pill sits at the foot of the sheet: below it, the menu and the calendar would leave
		// the screen, so both open above it.
		const bottomOf = async (box: Locator) => {
			const { y, height } = (await box.boundingBox())!;
			return y + height;
		};
		await dayPill(page).click();
		const menu = page.getByRole('menu');
		await expect(menu).toBeVisible();
		expect(await bottomOf(menu)).toBeLessThan((await dayPill(page).boundingBox())!.y);

		await page.getByRole('menuitem', { name: 'Another day…' }).click();
		const calendar = page.getByRole('group', { name: 'Choose a day' });
		await expect(calendar).toBeVisible();
		expect(await bottomOf(calendar)).toBeLessThan((await dayPill(page).boundingBox())!.y);

		// A year of months passes some that fill five weeks and some that fill six.
		const previous = calendar.getByRole('button', { name: 'Previous month' });
		const next = calendar.getByRole('button', { name: 'Next month' });
		const arrows = async () => [await previous.boundingBox(), await next.boundingBox()];
		const before = await arrows();
		for (let step = 0; step < 12; step++) {
			await previous.click();
			expect(await arrows()).toEqual(before);
		}
	});
});

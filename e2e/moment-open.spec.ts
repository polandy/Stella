import { expect, test, type Page } from '@playwright/test';
import { mention, signIn } from './app';

/*
 * A moment shown as a row — Home, a search hit — opens its own entry on tap
 * (docs/05 §5.5). Each case writes its own sentence, so it finds its row whatever else
 * the suite has written.
 */

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

async function writeMoment(page: Page, words: string) {
	await mention(page, 'Lena', /Lena Brunner/);
	await page.getByLabel('What happened?').pressSequentially(words);
	await page.getByRole('button', { name: /^Save/ }).click();
	await expect(page.locator('article', { hasText: words })).toBeVisible();
}

test('a tap on a moment’s words in the stream opens that entry', async ({ page }) => {
	const words = 'tapped the stream row for the opening test';
	await writeMoment(page, words);

	// The body opens with the person's chip, which leads to them; the row's empty right side is the entry's.
	const box = (await page.locator('article', { hasText: words }).boundingBox())!;
	await page.mouse.click(box.x + box.width - 12, box.y + box.height / 2);

	await page.waitForURL(/\/contacts\/[^/]+\/journal#entry-[^/]+$/);
	await expect(page.locator('article[id^="entry-"]', { hasText: words })).toBeVisible();
});

test('the row’s link is reachable by keyboard and named', async ({ page }) => {
	const words = 'reached the stream row by keyboard';
	await writeMoment(page, words);

	const open = page.locator('article', { hasText: words }).getByRole('link', {
		name: 'Open this moment'
	});
	await open.focus();
	await expect(open).toBeFocused();
	await page.keyboard.press('Enter');

	await page.waitForURL(/\/contacts\/[^/]+\/journal#entry-[^/]+$/);
});

test('the person’s name in a row still opens their journal, not the entry', async ({ page }) => {
	const words = 'named link beats the row link';
	await writeMoment(page, words);

	await page
		.locator('article', { hasText: words })
		.getByRole('link', { name: 'Lena Brunner' })
		.first()
		.click();

	await page.waitForURL(/\/contacts\/[^/]+\/journal$/);
});

test('a search hit opens the entry it found', async ({ page }) => {
	const words = 'zanzibar lantern for the search hit';
	await writeMoment(page, words);

	await page.goto(`/search?q=${encodeURIComponent('zanzibar lantern')}`);
	await page.getByRole('link', { name: /zanzibar lantern/ }).click();

	await page.waitForURL(/\/contacts\/[^/]+\/journal#entry-[^/]+$/);
	await expect(page.locator('article[id^="entry-"]', { hasText: words })).toBeVisible();
});

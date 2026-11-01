import { expect, test, type Page } from '@playwright/test';
import { signIn } from './app';

/*
 * The calendar link (docs/02 §2.13.4), end to end: a member makes it on Settings → Calendar,
 * sees it once, a calendar app fetches the household's dates through it, and it stops the
 * moment it is replaced or revoked. Written after the owner subscribed a phone to it with
 * ICSx⁵ on Android (docs/08 §8.4.1).
 *
 * Every refusal is paired with the same link answering first, so no case can pass because
 * the feed answers nothing at all.
 */

const OK = 200;
const NOT_FOUND = 404;

/** Reads the link the settings page shows once after *Create*. */
async function shownLink(page: Page): Promise<string> {
	const link = (await page.getByTestId('new-calendar-link').locator('code').textContent()) ?? '';
	expect(link).toMatch(/\/cal\/[^/]+\.ics$/);
	return link;
}

test('a calendar link is shown once, serves the dates, and stops when replaced or revoked', async ({
	page
}) => {
	await signIn(page);
	await page.goto('/settings');
	await page.getByRole('link', { name: /Calendar/ }).click();
	await page.getByRole('button', { name: 'Create calendar link' }).click();
	const first = await shownLink(page);

	await page.getByRole('button', { name: 'Copy', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();

	const feed = await page.request.get(first);
	expect(feed.status()).toBe(OK);
	expect(feed.headers()['content-type']).toContain('text/calendar');
	expect(await feed.text()).toContain("SUMMARY:Markus Brunner's birthday");

	// Once dismissed, the page keeps only the link's row: the secret is not shown again.
	await page.getByRole('button', { name: 'Done' }).click();
	await expect(page.getByTestId('new-calendar-link')).toHaveCount(0);
	await expect(page.getByTestId('calendar-link')).toBeVisible();

	await page.getByRole('button', { name: 'Create a new link…' }).click();
	await page.getByRole('button', { name: 'Create new link' }).click();
	const second = await shownLink(page);
	expect(second).not.toBe(first);
	expect((await page.request.get(first)).status()).toBe(NOT_FOUND);
	expect((await page.request.get(second)).status()).toBe(OK);

	await page.getByRole('button', { name: 'Done' }).click();
	await page.getByRole('button', { name: 'Revoke…' }).click();
	await page.getByTestId('calendar-confirm').getByRole('button', { name: 'Revoke' }).click();
	await expect(page.getByText('Calendar link revoked.')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Create calendar link' })).toBeVisible();
	expect((await page.request.get(second)).status()).toBe(NOT_FOUND);
});

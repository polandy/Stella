import { expect, test, type Page } from '@playwright/test';
import { addPerson, fillDate, signIn } from './app';

/*
 * The calendar link (docs/02 §2.13.4), end to end: a member makes it on Settings → Calendar,
 * sees it once, a calendar app fetches the household's dates and the member's open to-dos with
 * a day through it, and it stops the moment it is replaced or revoked. Written after the owner subscribed a phone to it with
 * ICSx⁵ on Android (docs/08 §8.4.1).
 *
 * Every refusal is paired with the same link answering first, so no case can pass because
 * the feed answers nothing at all; a to-do left out is paired with one let in.
 *
 * A member has one link, so its whole life is one case: two would replace each other's. The
 * suite shares one database, so the to-dos stand on a person of the case's own, on a day
 * fixed far from today — no clock is read, and Home's band never shows them.
 */

const OK = 200;
const NOT_FOUND = 404;

/** Six letters no other attempt shares. */
function runLetters(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) =>
		String.fromCharCode(97 + (byte % 26))
	).join('');
}

const todoRow = (page: Page, title: string) =>
	page.getByTestId('todos').locator('li', { hasText: title });

/** Notes a to-do on the open person page, by a day when one is given. */
async function addTodo(page: Page, title: string, dueOn?: string): Promise<void> {
	const card = page.locator('#section-todos');
	await card.getByRole('button', { name: 'Add', exact: true }).click();
	const form = card.getByTestId('todo-form');
	await form.getByLabel('What is still to do?').fill(title);
	if (dueOn !== undefined) {
		await form.getByRole('button', { name: 'By when?' }).click();
		await fillDate(form, 'By', dueOn);
	}
	await form.getByRole('button', { name: 'Save' }).click();
	await expect(todoRow(page, title)).toHaveCount(1);
}

/** The feed's text with its folded lines joined again (RFC 5545 §3.1). */
async function feedText(page: Page, link: string): Promise<string> {
	return (await (await page.request.get(link)).text()).replace(/\r\n /g, '');
}

/** Reads the link the settings page shows once after *Create*. */
async function shownLink(page: Page): Promise<string> {
	const link = (await page.getByTestId('new-calendar-link').locator('code').textContent()) ?? '';
	expect(link).toMatch(/\/cal\/[^/]+\.ics$/);
	return link;
}

test('a calendar link is shown once, serves the dates and dated to-dos, and stops when replaced or revoked', async ({
	page
}) => {
	await signIn(page);
	const letters = runLetters();
	await addPerson(page, 'Kalenda', `Imboden${letters}`);
	const personPage = page.url();
	const dated = `Give back the book ${letters}`;
	const undated = `Send the recipe ${letters}`;
	await addTodo(page, dated, '2031-05-14');
	await addTodo(page, undated);

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
	const withTodos = await feedText(page, first);
	expect(withTodos).toContain(`SUMMARY:To-do: ${dated} (Kalenda Imboden${letters})`);
	expect(withTodos).toContain('DTSTART;VALUE=DATE:20310514');
	expect(withTodos).not.toContain(undated);

	// Once dismissed, the page keeps only the link's row: the secret is not shown again.
	await page.getByRole('button', { name: 'Done' }).click();
	await expect(page.getByTestId('new-calendar-link')).toHaveCount(0);
	await expect(page.getByTestId('calendar-link')).toBeVisible();

	// The answer is in; while the page reloads its data the old link must not come back on screen.
	let release = () => {};
	const held = new Promise<void>((resolve) => (release = resolve));
	let arrived = () => {};
	const requested = new Promise<void>((resolve) => (arrived = resolve));
	await page.route(/\/settings\/calendar\/__data\.json/, async (route) => {
		arrived();
		await held;
		await route.continue();
	});
	await page.getByRole('button', { name: 'Create a new link…' }).click();
	await page.getByRole('button', { name: 'Create new link' }).click();
	await requested;
	await expect(page.getByTestId('new-calendar-link')).toHaveCount(0);
	release();
	const second = await shownLink(page);
	expect(second).not.toBe(first);
	expect((await page.request.get(first)).status()).toBe(NOT_FOUND);
	expect((await page.request.get(second)).status()).toBe(OK);
	expect(await feedText(page, second)).toContain(dated);

	// Ticked, it leaves the calendar on the next fetch — while the dates stay, so the feed
	// itself still answers.
	await page.goto(personPage);
	await todoRow(page, dated).getByText(dated).click();
	await expect(page.getByText(`Done: ${dated}`)).toBeVisible();
	await expect.poll(() => feedText(page, second)).not.toContain(dated);
	expect(await feedText(page, second)).toContain("SUMMARY:Markus Brunner's birthday");

	await page.goto('/settings/calendar');
	await page.getByRole('button', { name: 'Revoke…' }).click();
	await page.getByTestId('calendar-confirm').getByRole('button', { name: 'Revoke' }).click();
	await expect(page.getByText('Calendar link revoked.')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Create calendar link' })).toBeVisible();
	expect((await page.request.get(second)).status()).toBe(NOT_FOUND);
});

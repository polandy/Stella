import { expect, test, type Page } from '@playwright/test';
import { appReady, isoDaysAfter, serverToday, signIn } from './app';
import { personIdOf, seedHousehold } from './seed';
import { UNDO_WINDOW_MS } from '../src/lib/undo/pending-removals';
import { DEMO_ADMIN_PASSWORD, DEMO_MEMBER_EMAIL } from '../src/lib/server/db/demo-seed';

/*
 * The outing ideas on Home (docs/dev/02 §2.27.7): the next three dated ones sorted in among the
 * dates of *Coming up*, a booked one and the undated count on the person's date line, a passed one
 * asking *Done? Still on?* and each of its answers, a private idea the other member never sees,
 * and a phone's folded line that never names one. The page's clock is the test's; days come from
 * the server's today. The suite shares one database, so every person is the run's own, and the
 * ideas are the soonest there are.
 */

/** Six letters no other attempt shares. */
function runLetters(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) =>
		String.fromCharCode(97 + (byte % 26))
	).join('');
}

const PIXEL_9_PRO = { width: 412, height: 915 };

const comingUp = (page: Page) => page.getByTestId('coming-up');
const row = (page: Page, text: string) => comingUp(page).locator('li', { hasText: text });
const ask = (page: Page, title: string) =>
	page.getByRole('group', { name: `Did “${title}” happen?` });

/** Seeds Mia, whose birthday is today, and her ideas; gives back the titles and her name. */
async function seedMia(page: Page) {
	const today = await serverToday(page);
	const letters = runLetters();
	const name = `Mia Ausflug${letters}`;
	const titles = {
		secret: `Secret ${letters}`,
		concert: `Concert ${letters}`,
		cinema: `Cinema ${letters}`,
		fourth: `Fourth ${letters}`,
		zoo: `Zoo ${letters}`,
		lake: `Lake ${letters}`,
		walk: `Walk ${letters}`,
		swim: `Swim ${letters}`,
		run: `Run ${letters}`,
		old: `Old ${letters}`
	};
	const on = (days: number) => ({ kind: 'on_date' as const, on: isoDaysAfter(today, days) });
	await seedHousehold(
		page,
		[name],
		[],
		{},
		[],
		[],
		[],
		{ [name]: `${Number(today.slice(0, 4)) - 7}${today.slice(4)}` },
		{},
		{},
		{},
		{
			[name]: [
				// This month sorts at its first day, ahead of every idea of the suite.
				{
					title: titles.secret,
					when: { kind: 'in_month', on: today.slice(0, 7) },
					visibility: 'private'
				},
				{ title: titles.concert, when: on(1) },
				{ title: titles.cinema, when: on(3) },
				{ title: titles.fourth, when: on(4) },
				{ title: titles.zoo, when: on(2), bookedAt: `${today}T08:00:00Z` },
				{ title: titles.lake },
				{ title: titles.walk, when: on(-2) },
				{ title: titles.swim, when: on(-3) },
				{ title: titles.run, when: on(-4) },
				{ title: titles.old, when: on(-10) }
			]
		}
	);
	return { today, name, titles };
}

test('the dated ideas join Coming up, and a passed one asks until answered', async ({
	page
}, testInfo) => {
	await page.clock.install();
	await signIn(page);
	const { today, name, titles } = await seedMia(page);
	test.skip(today.slice(5) === '02-29', 'a leap-day birthday falls on 1 March');
	await page.goto('/');
	await appReady(page);

	// The three passed within the week ask first, the longest gone on top; the old one does not.
	for (const title of [titles.run, titles.swim, titles.walk])
		await expect(ask(page, title)).toContainText('Done? Still on?');
	await expect(comingUp(page)).not.toContainText(titles.old);
	const order = await comingUp(page)
		.locator('li')
		.evaluateAll((items) => items.map((item) => item.textContent ?? ''));
	const at = (text: string) => order.findIndex((item) => item.includes(text));
	expect(at(titles.run)).toBeLessThan(at(titles.swim));
	expect(at(titles.swim)).toBeLessThan(at(titles.walk));

	// Then by day: this month's idea, Mia's birthday, tomorrow's concert, the cinema in three days.
	const birthday = order.findIndex((item) => item.includes(name) && item.includes('turns 7'));
	expect(at(titles.walk)).toBeLessThan(at(titles.secret));
	expect(at(titles.secret)).toBeLessThan(birthday);
	expect(birthday).toBeLessThan(at(titles.concert));
	expect(at(titles.concert)).toBeLessThan(at(titles.cinema));
	// Three dated ideas, however many there are; the booked zoo is on Mia's line instead.
	await expect(comingUp(page)).not.toContainText(titles.fourth);
	await expect(row(page, titles.concert)).toContainText(`Outing with ${name}`);
	await expect(row(page, titles.concert).getByTestId('coming-up-plan-when')).toHaveText('tomorrow');
	const mia = comingUp(page).locator('li', { hasText: 'turns 7' }).filter({ hasText: name });
	await expect(mia.getByTestId('coming-up-booked')).toHaveText(`booked: ${titles.zoo}`);
	await expect(mia.getByTestId('coming-up-plan-ideas')).toHaveText('1 idea together');
	await expect(comingUp(page)).not.toContainText(titles.lake);
	await expect(row(page, titles.run).getByTestId('coming-up-plan-when')).toHaveText(/ · passed$/);
	// The rail scrolls within the page, so a tall window shows all of it.
	await page.setViewportSize({ width: 1280, height: 2000 });
	await comingUp(page).screenshot({ path: testInfo.outputPath('coming-up.png') });

	// Next year: it stops asking, and a year ahead it is no row of the three.
	await ask(page, titles.walk).getByRole('button', { name: 'Next year' }).click();
	await expect(ask(page, titles.walk)).toHaveCount(0);
	await expect(comingUp(page)).not.toContainText(titles.walk);

	// Kept without a date: it stops asking, and counts on Mia's line.
	await ask(page, titles.swim).getByRole('button', { name: 'Keep without a date' }).click();
	await expect(ask(page, titles.swim)).toHaveCount(0);
	await expect(mia.getByTestId('coming-up-plan-ideas')).toHaveText('2 ideas together');

	// Done: the toast says so, and the question goes.
	await ask(page, titles.run).getByTestId('plan-done').click();
	await expect(
		page.getByTestId('toast-undo').filter({ hasText: `Done: ${titles.run}` })
	).toBeVisible();
	await expect(ask(page, titles.run)).toHaveCount(0);

	// The card has the answers: one done, the others still ideas.
	await page.goto(`/contacts/${personIdOf(name)}`);
	await appReady(page);
	const card = page.locator('#section-plans');
	await expect(card.getByRole('tab', { name: /Done/ })).toHaveText('Done · 1');
});

test('a passed idea deleted from Home is gone once the undo window closes', async ({ page }) => {
	await page.clock.install();
	await signIn(page);
	const { titles } = await seedMia(page);
	await page.goto('/');
	await appReady(page);

	await ask(page, titles.swim).getByRole('button', { name: 'Delete' }).click();
	await expect(page.getByTestId('toast-undo').filter({ hasText: 'Idea removed' })).toBeVisible();
	await expect(comingUp(page)).not.toContainText(titles.swim);
	await page.clock.runFor(UNDO_WINDOW_MS + 1000);
	await expect(page.getByTestId('toast-undo')).toHaveCount(0);
	await page.reload();
	await appReady(page);
	await expect(comingUp(page)).not.toContainText(titles.swim);
	// The others answered too, so no later case finds them asking.
	for (const title of [titles.walk, titles.run])
		await ask(page, title).getByRole('button', { name: 'Keep without a date' }).click();
	await expect(ask(page, titles.run)).toHaveCount(0);
});

test('the other member sees the shared ideas on Home, never a private one', async ({
	page,
	browser
}) => {
	await signIn(page);
	const { titles } = await seedMia(page);
	const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
	const nina = await context.newPage();
	await nina.clock.install();
	await nina.goto('/login');
	await nina.getByLabel('Email').fill(DEMO_MEMBER_EMAIL);
	await nina.getByLabel('Password').fill(DEMO_ADMIN_PASSWORD);
	await nina.getByRole('button', { name: 'Sign in', exact: true }).click();
	await appReady(nina);

	await expect(row(nina, titles.concert)).toContainText('Outing with');
	await expect(ask(nina, titles.walk)).toBeVisible();
	await expect(comingUp(nina)).not.toContainText(titles.secret);
	// Answered here, so no later case finds them asking.
	for (const title of [titles.walk, titles.swim, titles.run])
		await ask(nina, title).getByRole('button', { name: 'Keep without a date' }).click();
	await expect(comingUp(nina).getByTestId('plan-ask')).toHaveCount(0);
	await context.close();
});

test.describe('on a phone', () => {
	test.use({ viewport: PIXEL_9_PRO, hasTouch: true });

	test('the folded line never names a private idea', async ({ page }, testInfo) => {
		await page.clock.install();
		await signIn(page);
		const { titles } = await seedMia(page);
		await page.goto('/');
		await appReady(page);
		const toggle = page.getByTestId('coming-up-toggle');
		await toggle.click();
		// With the passed ones answered, a private month idea is the first row.
		for (const title of [titles.walk, titles.swim, titles.run])
			await ask(page, title).getByRole('button', { name: 'Keep without a date' }).click();
		await expect(comingUp(page).getByTestId('plan-ask')).toHaveCount(0);

		// Folded, it names the first birthday instead: a Mia of this file, born today.
		await toggle.click();
		await expect(toggle).not.toContainText('Secret');
		await expect(toggle).toContainText(/Mia Ausflug\w+ turns 7/);
		await page
			.getByTestId('coming-up')
			.screenshot({ path: testInfo.outputPath('phone-folded.png') });
	});
});

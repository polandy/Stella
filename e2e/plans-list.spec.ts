import { expect, test, type Page } from '@playwright/test';
import { appReady, isoDaysAfter, serverToday, signIn } from './app';
import { personIdOf, seedHousehold } from './seed';
import { DEMO_ADMIN_PASSWORD, DEMO_MEMBER_EMAIL } from '../src/lib/server/db/demo-seed';

/*
 * The household's outing ideas beyond one person (docs/dev/02 §2.27.9–10): `/plans` and its
 * groups, *Ideas beyond three months*, ticking there, *All outings* and *Outing with …* in the palette,
 * full search, and a private idea the other member finds nowhere. The page's clock is the test's;
 * days come from the server's today. The suite shares one database, so every case reads only the
 * rows of its own person, named with letters no other attempt shares.
 */

/** Six letters no other attempt shares. */
function runLetters(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) =>
		String.fromCharCode(97 + (byte % 26))
	).join('');
}

const PIXEL_9_PRO = { width: 412, height: 915 };

const group = (page: Page, heading: string) =>
	page.getByTestId('plan-list-group').filter({ has: page.getByRole('heading', { name: heading }) });

/** Seeds Ida and her ideas: today, in six weeks, in half a year, some time, and a private one. */
async function seedIda(page: Page) {
	const today = await serverToday(page);
	const letters = runLetters();
	const name = `Ida Ausflug${letters}`;
	const titles = {
		today: `Picnic ${letters}`,
		soon: `Museum ${letters}`,
		far: `Lake ${letters}`,
		someTime: `Concert ${letters}`,
		secret: `Secret ${letters}`
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
		{},
		{},
		{},
		{},
		{
			[name]: [
				{ title: titles.today, when: on(0) },
				{ title: titles.soon, when: on(42) },
				{ title: titles.far, when: on(200) },
				{ title: titles.someTime },
				{ title: titles.secret, visibility: 'private' }
			]
		}
	);
	return { letters, name, titles };
}

async function openPlanList(page: Page): Promise<void> {
	await page.goto('/plans');
	await appReady(page);
}

test('the list groups the open ideas, folds the far ones, ticks one off and is the card’s ⋯ away', async ({
	page
}, testInfo) => {
	await page.clock.install();
	await signIn(page);
	const { name, titles } = await seedIda(page);
	await openPlanList(page);

	await expect(page.getByRole('heading', { name: /^Outings/, level: 1 })).toBeVisible();
	await expect(group(page, 'This month')).toContainText(titles.today);
	await expect(group(page, 'Soon')).toContainText(titles.soon);
	await expect(group(page, 'Some time')).toContainText(titles.someTime);
	await expect(group(page, 'Some time')).toContainText(titles.secret);
	await expect(page.getByTestId('plan-list-group').filter({ hasText: titles.far })).toHaveCount(0);
	await expect(group(page, 'Soon').locator('li', { hasText: titles.soon })).toContainText(
		`with ${name}`
	);

	// Half a year ahead waits behind the toggle, then joins *Soon* after the six weeks.
	const later = page.getByTestId('plan-list-later');
	await expect(later).toContainText(/^Ideas beyond three months \(\d+\)$/);
	await later.click();
	await expect(later).toHaveAttribute('aria-pressed', 'true');
	const rows = await group(page, 'Soon')
		.locator('li')
		.evaluateAll((items) => items.map((item) => item.textContent ?? ''));
	const at = (text: string) => rows.findIndex((row) => row.includes(text));
	expect(at(titles.soon)).toBeGreaterThanOrEqual(0);
	expect(at(titles.soon)).toBeLessThan(at(titles.far));
	await page.setViewportSize({ width: 1280, height: 2000 });
	await page.locator('main').screenshot({ path: testInfo.outputPath('plans-list.png') });

	// Ticked here: the toast says so, and it is off the list and on the card's *Done* tab.
	await page.getByRole('checkbox', { name: `Done: ${titles.today}` }).click();
	await expect(
		page.getByTestId('toast-undo').filter({ hasText: `Done: ${titles.today}` })
	).toBeVisible();
	await page.reload();
	await appReady(page);
	await expect(page.getByTestId('plan-list-group').filter({ hasText: titles.today })).toHaveCount(
		0
	);
	await page.goto(`/contacts/${personIdOf(name)}`);
	await appReady(page);
	await expect(page.locator('#section-plans').getByRole('tab', { name: /Done/ })).toHaveText(
		'Done · 1'
	);

	// The card's ⋯ menu leads back to the list.
	await page.locator('#section-plans').getByRole('button', { name: 'More for outings' }).click();
	await page.getByRole('menuitem', { name: 'All outings' }).click();
	await page.waitForURL('/plans');
});

test('the palette opens the list, and the card’s form for a person', async ({ page }) => {
	await page.clock.install();
	await signIn(page);
	const { name } = await seedIda(page);
	await page.goto('/');
	await appReady(page);

	await page.keyboard.press('Control+k');
	const palette = page.getByRole('dialog', { name: 'Jump to' });
	await palette.getByRole('combobox').fill('all outings');
	await palette.getByRole('option', { name: /^All outings/ }).click();
	await page.waitForURL('/plans');

	await page.keyboard.press('Control+k');
	await palette.getByRole('combobox').fill('outing with');
	await palette.getByRole('option', { name: /^Outing with/ }).click();
	const field = palette.getByRole('combobox', { name: 'An outing with whom?' });
	await expect(field).toBeFocused();
	await field.fill(name);
	await palette.getByRole('option', { name: new RegExp(name) }).click();
	await page.waitForURL(`/contacts/${personIdOf(name)}?plan=new`);
	await expect(page.locator('#section-plans').getByLabel('What do you want to do?')).toBeVisible();
});

test('full search finds an idea by its title, and a done one marked done', async ({ page }) => {
	await page.clock.install();
	await signIn(page);
	const { letters, name, titles } = await seedIda(page);
	await openPlanList(page);
	await page.getByRole('checkbox', { name: `Done: ${titles.today}` }).click();
	await expect(
		page.getByTestId('toast-undo').filter({ hasText: `Done: ${titles.today}` })
	).toBeVisible();

	await page.goto(`/search?q=${encodeURIComponent(letters)}`);
	const hits = page.getByTestId('search-plans');
	await expect(hits.getByRole('link')).toHaveCount(5);
	const doneHit = hits.getByRole('link', { name: new RegExp(titles.today) });
	await expect(doneHit).toContainText(/· done \d/);
	await expect(hits.getByRole('link').last()).toContainText(titles.today);
	const openHit = hits.getByRole('link', { name: new RegExp(titles.soon) });
	await expect(openHit).toContainText(`with ${name}`);
	await openHit.click();
	await page.waitForURL(new RegExp(`/contacts/${personIdOf(name)}`));
	await expect(page.locator('#section-plans')).toContainText(titles.soon);
});

test('the other member finds a private idea neither on the list nor in search', async ({
	page,
	browser
}) => {
	await signIn(page);
	const { letters, titles } = await seedIda(page);
	const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
	const nina = await context.newPage();
	await nina.clock.install();
	await nina.goto('/login');
	await nina.getByLabel('Email').fill(DEMO_MEMBER_EMAIL);
	await nina.getByLabel('Password').fill(DEMO_ADMIN_PASSWORD);
	await nina.getByRole('button', { name: 'Sign in', exact: true }).click();
	await appReady(nina);

	await openPlanList(nina);
	await expect(group(nina, 'Some time')).toContainText(titles.someTime);
	await expect(nina.getByText(titles.secret)).toHaveCount(0);
	await nina.goto(`/search?q=${encodeURIComponent(letters)}`);
	await expect(nina.getByTestId('search-plans')).toContainText(titles.someTime);
	await expect(nina.getByText(titles.secret)).toHaveCount(0);
	await context.close();
});

test.describe('on a phone', () => {
	test.use({ viewport: PIXEL_9_PRO, hasTouch: true });

	test('the list reads on a phone', async ({ page }, testInfo) => {
		await page.clock.install();
		await signIn(page);
		const { titles } = await seedIda(page);
		await openPlanList(page);
		await expect(group(page, 'This month')).toContainText(titles.today);
		await group(page, 'This month')
			.locator('li', { hasText: titles.today })
			.screenshot({ path: testInfo.outputPath('phone-row.png') });
		await page.screenshot({ path: testInfo.outputPath('phone-list.png') });
	});
});

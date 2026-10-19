import { expect, test, type Browser, type Page } from '@playwright/test';
import { appReady, signIn } from './app';
import { seedHousehold } from './seed';
import { DEMO_ADMIN_PASSWORD, DEMO_MEMBER_EMAIL } from '../src/lib/server/db/demo-seed';

/*
 * Sub-circles shown, read-only (docs/02 §2.4.2): the Circles page as families — a card per
 * top-level circle, its sub-circles as rows inside it — and on a circle's page the way up, the
 * siblings either side and the Sub-circles card. Written after the owner saw it in the running
 * app (docs/08 §8.4.1).
 *
 * The demo's Schule Breitenrain with Klasse 5b and Klasse 3a is read as it is. What the demo has
 * no example of — a sub-circle whose period is over, one private to its creator — comes from a
 * family of the case's own, brought in through the archive restore (nesting has no form yet).
 */

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

/** The circles of one case's academy, named after it so no two cases share one. */
function academyOf(school: string) {
	return {
		academy: `${school} Academy`,
		current: `${school} Year 6`,
		past: `${school} Year 1`,
		staff: `${school} Staff Room`
	};
}

/**
 * Brings in the academy with a current year, a year long over and a staff room private to its
 * creator. The restore is add-only by id, so each case seeds an academy of its own name.
 */
async function seedAcademy(page: Page, school: string): Promise<ReturnType<typeof academyOf>> {
	const names = academyOf(school);
	await seedHousehold(page, [], [], {}, [
		{ name: names.academy, members: [] },
		{ name: names.current, parent: names.academy, start: '2025-08-01', members: [] },
		{
			name: names.past,
			parent: names.academy,
			start: '2020-08-01',
			end: '2021-07-31',
			members: []
		},
		{ name: names.staff, parent: names.academy, visibility: 'private', members: [] }
	]);
	return names;
}

/** A second browser signed in as the household's other member, Nina. */
async function signInAsNina(browser: Browser): Promise<Page> {
	const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
	const page = await context.newPage();
	await page.goto('/login');
	await page.getByLabel('Email').fill(DEMO_MEMBER_EMAIL);
	await page.getByLabel('Password').fill(DEMO_ADMIN_PASSWORD);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'What happened?' })).toBeVisible();
	await appReady(page);
	return page;
}

async function openCircles(page: Page): Promise<void> {
	await page.goto('/circles');
	await appReady(page);
}

/** The card whose own link — not one of its rows — names `name`. */
function cardOf(page: Page, name: string) {
	return page
		.getByTestId('circle-card')
		.filter({ has: page.locator(':scope > a', { hasText: name }) });
}

/** The cards' own links: what stands on the list as a circle of its own. */
function cardLinks(page: Page) {
	return page.getByTestId('circle-cards').locator('[data-testid="circle-card"] > a');
}

const rows = (card: ReturnType<typeof cardOf>) => card.getByTestId('circle-subrow');

test('a sub-circle is a row on its parent’s card, not a card of its own', async ({ page }) => {
	await openCircles(page);
	const school = cardOf(page, 'Schule Breitenrain');
	await expect(school).toHaveCount(1);
	await expect(school).toContainText('2 sub-circles');
	await expect(rows(school).filter({ hasText: 'Klasse 5b' })).toHaveCount(1);
	await expect(rows(school).filter({ hasText: 'Klasse 3a' })).toHaveCount(1);

	// Beside the school's card, which is there, no card stands for the class.
	await expect(cardLinks(page).filter({ hasText: 'Schule Breitenrain' })).toHaveCount(1);
	await expect(cardLinks(page).filter({ hasText: 'Klasse 5b' })).toHaveCount(0);
});

test('a row opens the sub-circle, the card itself the parent', async ({ page }) => {
	await openCircles(page);
	const school = cardOf(page, 'Schule Breitenrain');
	await rows(school).filter({ hasText: 'Klasse 5b' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Klasse 5b' })).toBeVisible();
	await expect(page).toHaveURL(/\/circles\/[^/]+$/);

	await openCircles(page);
	await school.locator(':scope > a').click();
	await expect(page.getByRole('heading', { level: 1, name: 'Schule Breitenrain' })).toBeVisible();
});

test('a sub-circle whose period is over waits behind its toggle, which opens nothing', async ({
	page
}) => {
	const names = await seedAcademy(page, 'Larkspur');
	await openCircles(page);
	const academy = cardOf(page, names.academy);
	await expect(rows(academy).filter({ hasText: names.current })).toBeVisible();
	await expect(rows(academy).filter({ hasText: names.past })).toHaveCount(0);

	const toggle = academy.getByRole('button', { name: 'Show 1 past' });
	await expect(toggle).toHaveAttribute('aria-expanded', 'false');
	await toggle.click();

	// Unfolded in place: the row is there and the page is still the list.
	await expect(rows(academy).filter({ hasText: names.past })).toBeVisible();
	await expect(academy.getByRole('button', { name: 'Hide past' })).toHaveAttribute(
		'aria-expanded',
		'true'
	);
	await expect(page).toHaveURL(/\/circles$/);
});

test('a search keeps the family and shows only the rows that match', async ({ page }) => {
	const names = await seedAcademy(page, 'Juniper');
	await openCircles(page);
	const search = page.getByRole('searchbox', { name: 'Find a circle' });

	await search.fill('klasse');
	const school = cardOf(page, 'Schule Breitenrain');
	await expect(school).toHaveCount(1);
	// Both start the same day, so the name orders them.
	await expect(rows(school)).toHaveText([/Klasse 3a/, /Klasse 5b/]);
	await expect(cardOf(page, names.academy)).toHaveCount(0);

	// The parent does not match, so the card holds the one year that does.
	await search.fill(names.current);
	const academy = cardOf(page, names.academy);
	await expect(rows(academy)).toHaveCount(1);
	await expect(rows(academy)).toContainText(names.current);
});

test('a sub-circle’s page leads up to its parent and across to its siblings', async ({ page }) => {
	await openCircles(page);
	await rows(cardOf(page, 'Schule Breitenrain')).filter({ hasText: 'Klasse 5b' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Klasse 5b' })).toBeVisible();

	// The path is the top bar's trail, the parent a step of it; the page carries no second one.
	const trail = page.getByTestId('top-bar').getByRole('navigation', { name: 'Breadcrumb' });
	await expect(trail.getByRole('link')).toHaveText(['Home', 'Circles', 'Schule Breitenrain']);
	await expect(trail.getByRole('link', { name: 'Circles' })).toHaveAttribute('href', '/circles');
	await expect(trail.locator('[aria-current="page"]')).toHaveText('Klasse 5b');
	await expect(page.getByRole('navigation', { name: 'Circle path' })).toHaveCount(0);

	// A phone keeps only the way back, and that is the direct parent, not the list.
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(trail.getByTestId('back-crumb')).toHaveText('Schule Breitenrain');
	await page.setViewportSize({ width: 1280, height: 900 });

	// Both classes start the same day, so the name orders them: 3a, then 5b.
	const siblings = page.getByRole('navigation', { name: 'Neighbouring circles' });
	await siblings.getByRole('link', { name: 'Previous: Klasse 3a' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Klasse 3a' })).toBeVisible();
	await siblings.getByRole('link', { name: 'Next: Klasse 5b' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Klasse 5b' })).toBeVisible();

	await trail.getByRole('link', { name: 'Schule Breitenrain' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Schule Breitenrain' })).toBeVisible();
});

test('a circle’s page lists its sub-circles as links', async ({ page }) => {
	await openCircles(page);
	await cardOf(page, 'Schule Breitenrain').locator(':scope > a').click();
	await expect(page.getByRole('heading', { level: 1, name: 'Schule Breitenrain' })).toBeVisible();

	const card = page.locator('section', { has: page.getByRole('heading', { name: 'Sub-circles' }) });
	await expect(card.locator('header')).toHaveText(/^\s*Sub-circles\s*2\s*$/);
	const links = page.getByTestId('sub-circles').getByRole('link');
	await expect(links).toHaveCount(2);
	await links.filter({ hasText: 'Klasse 3a' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Klasse 3a' })).toBeVisible();
});

test('a private sub-circle someone else made is counted, never named', async ({
	page,
	browser
}) => {
	const names = await seedAcademy(page, 'Hawthorn');
	// Its creator sees it by name.
	await openCircles(page);
	await expect(rows(cardOf(page, names.academy)).filter({ hasText: names.staff })).toHaveCount(1);

	const nina = await signInAsNina(browser);
	await openCircles(nina);
	const academy = cardOf(nina, names.academy);
	await expect(rows(academy).filter({ hasText: names.current })).toBeVisible();
	await expect(academy).toContainText('+1 more');
	await expect(nina.getByText(names.staff)).toHaveCount(0);
	await nina.context().close();
});
